import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import websocket from '@fastify/websocket';
import path from 'path';
import { registerFileRoutes } from './fileRoutes.js';
import { registerRunRoutes } from './runRoutes.js';
import { registerParseRoutes } from './parseRoutes.js';
import { registerAnnotationRoutes } from './annotationRoutes.js';
import { registerEnvRoutes } from './envRoutes.js';
import { registerTerminalRoutes } from './terminalRoutes.js';
import { registerStateRoutes } from './stateRoutes.js';

const PORT = 3000;

const app = Fastify({ logger: true });

await app.register(cors, {
  origin: true,
  credentials: true,
});

await app.register(websocket);

await registerTerminalRoutes(app);
await registerFileRoutes(app);
await registerRunRoutes(app);
await registerParseRoutes(app);
await registerAnnotationRoutes(app);
await registerEnvRoutes(app);
await registerStateRoutes(app);

await app.register(fastifyStatic, {
  root: path.join(process.cwd(), 'frontend'),
  prefix: '/',
});

app.get('/api/health', async () => ({ status: 'ok' }));

app.listen({ port: PORT }, (err, addr) => {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
  console.log(`overGDS Studio running at http://localhost:${PORT}`);
});
