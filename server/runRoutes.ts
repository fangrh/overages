import type { FastifyInstance } from 'fastify';

export async function runRoutes(app: FastifyInstance) {
  app.get('/', async () => ({}));
}