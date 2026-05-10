import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import path from 'path';
import { registerFileRoutes } from './fileRoutes.js';
import { runRoutes } from './runRoutes.js';
import { parseRoutes } from './parseRoutes.js';
import { annotationRoutes } from './annotationRoutes.js';

const PORT = 3000;

const app = Fastify({ logger: true });

await app.register(cors, {
  origin: true,
  credentials: true,
});

await app.register(fastifyStatic, {
  root: path.join(process.cwd(), 'frontend'),
  prefix: '/',
});

await registerFileRoutes(app);
await app.register(runRoutes, { prefix: '/api/run' });
await app.register(parseRoutes, { prefix: '/api/parse' });
await app.register(annotationRoutes, { prefix: '/api/annotations' });

app.get('/api/health', async () => ({ status: 'ok' }));

app.listen({ port: PORT }, (err, addr) => {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
  console.log(`superGDS Studio running at http://localhost:${PORT}`);
});
