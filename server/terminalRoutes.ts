import { FastifyInstance, FastifyRequest } from 'fastify';
import { getWorkspacePath } from './workspace.js';
import ptyLib from 'node-pty';
import {
  isTmuxAvailable, sessionName, hasSession, createSession, capturePane,
} from '../lib/tmux.js';

const TMUX_AVAILABLE = isTmuxAvailable();

export async function registerTerminalRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/terminal', { websocket: true }, (socket, req: FastifyRequest) => {
    let pty: ptyLib.IPty | null = null;

    try {
      const cwd = getWorkspacePath();

      // Parse ?session=<id> from the upgrade URL (default keeps old behavior).
      const reqUrl = req.url ?? req.raw?.url ?? '/';
      const session =
        new URL(reqUrl, 'http://localhost').searchParams.get('session') || 'default';

      const cols = 80;
      const rows = 24;

      if (TMUX_AVAILABLE) {
        const name = sessionName(session);
        const existed = hasSession(name);
        if (!existed) {
          createSession(name, cwd, cols, rows);
        } else {
          // Reattach after a browser refresh: replay scrollback BEFORE the
          // tmux client redraws, so the user sees prior output again.
          const scrollback = capturePane(name);
          if (scrollback) socket.send(scrollback);
        }
        // The PTY is a tmux *client* (attach). Killing it on disconnect leaves
        // the tmux session — and the shell/claude inside it — alive.
        pty = ptyLib.spawn('tmux', ['attach', '-t', name], {
          name: 'xterm-256color',
          cols,
          rows,
          cwd,
          env: { ...process.env as Record<string, string>, TERM: 'xterm-256color' },
        });
      } else {
        // Fallback: plain shell, no persistence (tmux not installed).
        const shell = process.platform === 'darwin' ? '/bin/zsh' : '/bin/bash';
        pty = ptyLib.spawn(shell, [], {
          name: 'xterm-256color',
          cols,
          rows,
          cwd,
          env: { ...process.env as Record<string, string> },
        });
      }

      // PTY output → WebSocket
      pty.onData((data: string) => {
        socket.send(data);
      });

      // WebSocket → PTY input (resize control messages pass through unchanged)
      socket.on('message', (raw: Buffer | string) => {
        const msg = typeof raw === 'string' ? raw : raw.toString();
        try {
          const parsed = JSON.parse(msg);
          if (parsed.type === 'resize' && pty) {
            pty.resize(parsed.cols, parsed.rows);
            return;
          }
        } catch {
          // Not JSON — treat as raw terminal input
        }
        pty?.write(msg);
      });

      // Disconnect (incl. browser refresh): kill the client PTY only. With tmux
      // this detaches without destroying the session; without tmux it ends the
      // shell (unchanged from prior behavior).
      socket.on('close', () => {
        if (pty) {
          pty.kill();
          pty = null;
        }
      });

      pty.onExit(() => {
        socket.close();
        pty = null;
      });
    } catch (err) {
      socket.send(`\r\nTerminal error: ${(err as Error).message}\r\n`);
      socket.close();
    }
  });
}
