import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { parseGdsFile } from '../lib/gdsParser.js';

export async function registerParseRoutes(app: FastifyInstance) {
  app.post('/api/parse', async (req) => {
    const { gdsPath, pythonPath } = req.body as { gdsPath: string; pythonPath?: string };
    if (!gdsPath) throw new Error('gdsPath required');
    const geojson = await parseGdsFile(gdsPath, pythonPath);
    return { geojson, mode: 'full' };
  });
}