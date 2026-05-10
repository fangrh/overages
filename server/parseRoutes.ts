import type { FastifyInstance } from 'fastify';

export async function parseRoutes(app: FastifyInstance) {
  app.get('/', async () => ({}));
}