import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { runPythonScript } from '../lib/pythonRunner.js';
import { getWorkspacePath } from './workspace.js';
import path from 'path';

export async function registerRunRoutes(app: FastifyInstance) {
  app.get('/api/run', async (req: FastifyRequest, reply: FastifyReply) => {
    const { pythonFile, pythonPath } = req.query as { pythonFile: string; pythonPath?: string };
    if (!pythonFile) throw new Error('pythonFile required');

    const ws = getWorkspacePath();
    const fullPath = path.join(ws, pythonFile);

    reply.raw!.setHeader('Content-Type', 'text/event-stream');
    reply.raw!.setHeader('Cache-Control', 'no-cache');
    reply.raw!.setHeader('Connection', 'keep-alive');

    const send = (event: string, data: unknown) => {
      reply.raw!.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      // Force-flush so the data reaches EventSource before the connection closes
      (reply.raw as any).flush?.();
    };

    send('start', { status: 'running', pythonFile });

    try {
      const result = await runPythonScript(
        { pythonFile: fullPath, cwd: ws, pythonPath },
        (line) => send('stdout', { line }),
        (line) => send('stderr', { line })
      );
      send('complete', result);
    } catch (err: any) {
      send('error', { message: err.message });
    } finally {
      // Give EventSource time to receive final event before connection closes
      setTimeout(() => { reply.raw!.end(); }, 200);
    }
  });
}
