import type { FastifyInstance } from 'fastify';
import path from 'path';
import fs from 'fs/promises';
import { setWorkspacePath, getWorkspacePath, isWithinWorkspace } from './workspace.js';

export async function registerFileRoutes(app: FastifyInstance) {
  app.post('/workspace', async (req) => {
    const { workspace } = req.body as { workspace: string };
    if (!workspace) throw new Error('workspace path required');
    setWorkspacePath(workspace);
    return { success: true };
  });

  app.get('/api/files', async () => {
    const ws = getWorkspacePath();
    const files = await walkDir(ws, ws);
    return { files };
  });

  app.get('/files/*', async (req, reply) => {
    // GET /files/script.py → path = "script.py"
    const filePath = (req.params as any)['*'];
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
