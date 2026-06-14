import type { FastifyInstance } from 'fastify';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import { setWorkspacePath, getWorkspacePath, isWithinWorkspace, storeFiles, getStoredFile, hasFileStore, getRecentWorkspaces, removeRecentWorkspace } from './workspace.js';

interface WorkspaceBody {
  workspace: string;
  files?: Array<{ path: string; content: string }>;
  currentFile?: string;
}

export async function registerFileRoutes(app: FastifyInstance) {
  app.post('/workspace', async (req) => {
    const { workspace, files, currentFile } = req.body as WorkspaceBody;
    if (!workspace) throw new Error('workspace path required');

    // If files are sent (via File System Access API), store them
    if (files && files.length > 0) {
      await storeFiles(files, workspace);
    } else {
      // Otherwise use the path directly (for native filesystem access)
      await setWorkspacePath(workspace, currentFile);
    }
    return { success: true };
  });

  app.get('/api/files', async () => {
    const ws = getWorkspacePath();
    const files = await walkDir(ws, ws);
    return { files };
  });

  // Stat a single file's mtime. Used by the frontend's GDS-viewer auto-reload
  // poller: when a build runs outside the Compile button (LLM run_script, or a
  // command typed directly in the terminal), the only signal that the viewed
  // .gds changed is its modification time on disk. We poll this cheaply instead
  // of fs.watch because the workspace lives on a Windows (NTFS) drive mounted
  // into WSL2, where inotify does not fire reliably — stat polling always works.
  // Accepts an absolute path or a workspace-relative path.
  app.get('/api/gds-stat', async (req) => {
    const raw = ((req.query as { path?: string }).path ?? '').trim();
    if (!raw) return { exists: false, mtimeMs: 0 };
    const fullPath = path.isAbsolute(raw) ? raw : path.join(getWorkspacePath(), raw);
    try {
      const st = await fs.stat(fullPath);
      return { exists: true, mtimeMs: st.mtimeMs, path: fullPath };
    } catch {
      return { exists: false, mtimeMs: 0 };
    }
  });

  // Return current workspace state so frontend can restore
  app.get('/api/workspace', async () => {
    try {
      const ws = getWorkspacePath();
      return { workspace: ws };
    } catch {
      return { workspace: null };
    }
  });

  // Return list of recently opened workspaces
  app.get('/api/recent-workspaces', async () => {
    return { recent: getRecentWorkspaces() };
  });

  // Remove a workspace from the recent list
  app.delete('/api/recent-workspaces', async (req) => {
    const { path: wsPath } = req.body as { path: string };
    if (wsPath) removeRecentWorkspace(wsPath);
    return { success: true };
  });

  // VS Code-style server-side path autocomplete.
  // Given a partially-typed absolute path `q`, return the directories under
  // q's parent whose name starts with the trailing segment. e.g.
  //   q="/mn"     -> dirs under "/" starting with "mn"        (["/mnt"])
  //   q="/mnt/"   -> all dirs under "/mnt"                    (["/mnt/c","/mnt/e",...])
  //   q="/mnt/e/over" -> dirs under "/mnt/e" starting "over"  (["/mnt/e/overages"])
  // An empty `q` returns the user's home directory and its children, so the
  // picker can prefill the input with the home path.
  app.get('/api/browse', async (req) => {
    const raw = ((req.query as { q?: string }).q ?? '').trim();
    const home = os.homedir();

    let base: string;
    let partial: string;
    if (raw === '') {
      base = home;
      partial = '';
    } else {
      const text = raw.startsWith('~') ? home + raw.slice(1) : raw;
      const ls = text.lastIndexOf('/');
      base = ls <= 0 ? '/' : text.slice(0, ls);
      partial = text.slice(ls + 1);
    }

    const dirs: { name: string; path: string }[] = [];
    let error: string | undefined;
    try {
      const entries = await fs.readdir(base, { withFileTypes: true });
      for (const e of entries) {
        if (!e.isDirectory()) continue;
        if (partial && !e.name.startsWith(partial)) continue;
        dirs.push({ name: e.name, path: base === '/' ? `/${e.name}` : `${base}/${e.name}` });
      }
      dirs.sort((a, b) => a.name.localeCompare(b.name));
    } catch (err) {
      error = (err as NodeJS.ErrnoException).code || 'unreadable';
    }
    return { base, partial, home, dirs, error };
  });

  // Create a new project directory on the server, then the client opens it.
  app.post('/api/project/new', async (req) => {
    const { path: projPath } = req.body as { path?: string };
    if (!projPath || !path.isAbsolute(projPath)) {
      throw new Error('absolute project path required');
    }
    await fs.mkdir(projPath, { recursive: true });
    return { success: true, path: projPath };
  });

  app.get('/files/*', async (req, reply) => {
    // GET /files/script.py → path = "script.py"
    const filePath = (req.params as any)['*'];

    // Check if we have files from File System Access API
    if (hasFileStore()) {
      const storedPath = getStoredFile(filePath);
      if (storedPath) {
        try {
          const content = await fs.readFile(storedPath, 'utf-8');
          return { content, path: filePath };
        } catch {
          reply.code(404);
          return { error: 'File not found' };
        }
      }
    }

    if (!isWithinWorkspace(filePath)) throw new Error('Access denied');
    const fullPath = path.join(getWorkspacePath(), filePath);
    try {
      const content = await fs.readFile(fullPath, 'utf-8');
      return { content, path: filePath };
    } catch {
      reply.code(404);
      return { error: 'File not found' };
    }
  });

  app.post('/files/*', async (req, reply) => {
    const filePath = (req.params as any)['*'];
    if (!isWithinWorkspace(filePath)) throw new Error('Access denied');
    const { content } = req.body as { content: string };
    const fullPath = path.join(getWorkspacePath(), filePath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content, 'utf-8');
    return { success: true };
  });
}

async function walkDir(dir: string, base: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const relPath = path.relative(base, path.join(dir, entry.name));
    if (entry.isDirectory()) {
      const sub = await walkDir(path.join(dir, entry.name), base);
      files.push(...sub);
    } else {
      files.push(relPath.replace(/\\/g, '/'));
    }
  }
  return files;
}
