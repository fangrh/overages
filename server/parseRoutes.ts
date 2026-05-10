import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { parseGdsFile } from '../lib/gdsParser.js';

export async function registerParseRoutes(app: FastifyInstance) {
  app.post('/api/parse', async (req) => {
    const { gdsPath } = req.body as { gdsPath: string };
    if (!gdsPath) throw new Error('gdsPath required');
    const geojson = await parseGdsFile(gdsPath);
    return { geojson, mode: 'full' };
  });
}