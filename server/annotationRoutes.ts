import type { FastifyInstance } from 'fastify';

export async function annotationRoutes(app: FastifyInstance) {
  app.get('/', async () => ({}));
}