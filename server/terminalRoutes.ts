import { FastifyInstance } from 'fastify';
import { getWorkspacePath } from './workspace.js';
import ptyLib from 'node-pty';

export async function registerTerminalRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/terminal', { websocket: true }, (socket) => {
    let pty: ptyLib.IPty | null = null;

    try {
      const cwd = getWorkspacePath();
      const shell = process.platform === 'darwin' ? '/bin/zsh' : '/bin/bash';

      pty = ptyLib.spawn(shell, [], {
        name: 'xterm-256color',
        cols: 80,
        rows: 24,
        cwd,
        env: { ...process.env as Record<string, string> },
      });

      // PTY output → WebSocket
      pty.onData((data: string) => {
        socket.send(data);
      });

      // WebSocket → PTY input
      socket.on('message', (raw: Buffer | string) => {
        const msg = typeof raw === 'string' ? raw : raw.toString();

        // Check for JSON control messages (resize)
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

      // Clean up on disconnect
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
