import type { FastifyInstance } from 'fastify';
import path from 'path';
import fs from 'fs/promises';
import { setWorkspacePath, getWorkspacePath, isWithinWorkspace, storeFiles, getStoredFile, hasFileStore } from './workspace.js';

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

  // Return current workspace state so frontend can restore
  app.get('/api/workspace', async () => {
    try {
      const ws = getWorkspacePath();
      return { workspace: ws };
    } catch {
      return { workspace: null };
    }
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
