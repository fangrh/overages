// Thin synchronous wrappers around the `tmux` CLI. One responsibility: speak tmux.
// Used by the terminal route (attach/replay) and the server startup sweep.
// All calls swallow non-zero exits (return false/empty) so callers can branch
// without try/catch noise.

import { execFileSync } from 'node:child_process';

const TMUX_BIN = 'tmux';

/** True when a usable tmux binary is on PATH. */
export function isTmuxAvailable(): boolean {
  try {
    execFileSync(TMUX_BIN, ['-V'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/** Namespace a raw session id into a tmux session name (overgds-<id>). */
export function sessionName(id: string): string {
  return `overgds-${id}`;
}

/** True if a tmux session with this exact name exists. */
export function hasSession(name: string): boolean {
  try {
    execFileSync(TMUX_BIN, ['has-session', '-t', name], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/** Create a detached session (persists independent of any single client). */
export function createSession(name: string, cwd: string, cols: number, rows: number): void {
  execFileSync(
    TMUX_BIN,
    ['new-session', '-d', '-s', name, '-x', String(cols), '-y', String(rows), '-c', cwd],
    { stdio: 'ignore', env: { ...process.env, TERM: 'xterm-256color' } },
  );
  // Best-effort display options. These work whether or not a tmux server
  // pre-existed; failures (e.g. option unsupported on old tmux) are ignored.
  try { execFileSync(TMUX_BIN, ['set-option', '-t', name, 'status', 'off'], { stdio: 'ignore' }); } catch {}
  try { execFileSync(TMUX_BIN, ['set-option', '-t', name, 'escape-time', '10'], { stdio: 'ignore' }); } catch {}
  try { execFileSync(TMUX_BIN, ['set-option', '-g', 'history-limit', '10000'], { stdio: 'ignore' }); } catch {}
}

/** Capture the full pane buffer (scrollback + current screen) as plain text. */
export function capturePane(name: string): string {
  try {
    return execFileSync(
      TMUX_BIN,
      ['capture-pane', '-p', '-S', '-', '-E', '-', '-t', name],
      { encoding: 'utf8' },
    );
  } catch {
    return '';
  }
}

/** Resize the tmux window to match the client xterm size. */
export function resizeWindow(name: string, cols: number, rows: number): void {
  try {
    execFileSync(
      TMUX_BIN,
      ['resize-window', '-t', name, '-x', String(cols), '-y', String(rows)],
      { stdio: 'ignore' },
    );
  } catch {}
}

/** Kill a session by name. No-op if it does not exist. */
export function killSession(name: string): void {
  try {
    execFileSync(TMUX_BIN, ['kill-session', '-t', name], { stdio: 'ignore' });
  } catch {}
}

/** List all tmux session names (empty if no server / no sessions). */
export function listSessions(): string[] {
  try {
    const out = execFileSync(TMUX_BIN, ['list-sessions', '-F', '#{session_name}'], {
      encoding: 'utf8',
    });
    return out.split('\n').map(s => s.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

/** Kill every session whose name starts with `prefix`. Returns the count killed. */
export function sweepStaleSessions(prefix: string): number {
  let killed = 0;
  for (const name of listSessions()) {
    if (name.startsWith(prefix)) {
      killSession(name);
      killed++;
    }
  }
  return killed;
}