import { runPythonScript } from '../lib/pythonRunner.js';
import { getWorkspacePath } from './workspace.js';
import path from 'path';
export async function registerRunRoutes(app) {
    app.get('/api/run', async (req, reply) => {
        const { pythonFile } = req.query;
        if (!pythonFile)
            throw new Error('pythonFile required');
        const ws = getWorkspacePath();
        const fullPath = path.join(ws, pythonFile);
        reply.raw.setHeader('Content-Type', 'text/event-stream');
        reply.raw.setHeader('Cache-Control', 'no-cache');
        reply.raw.setHeader('Connection', 'keep-alive');
        const send = (event, data) => {
            reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
            // Force-flush so the data reaches EventSource before the connection closes
            reply.raw.flush?.();
        };
        send('start', { status: 'running', pythonFile });
        try {
            const result = await runPythonScript({ pythonFile: fullPath, cwd: ws }, (line) => send('stdout', { line }), (line) => send('stderr', { line }));
            send('complete', result);
        }
        catch (err) {
            send('error', { message: err.message });
        }
        finally {
            // Give EventSource time to receive final event before connection closes
            setTimeout(() => { reply.raw.end(); }, 200);
        }
    });
}
