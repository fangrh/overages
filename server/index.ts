import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import websocket from '@fastify/websocket';
import path from 'path';
import { sweepStaleSessions, isTmuxAvailable } from '../lib/tmux.js';
import { registerFileRoutes } from './fileRoutes.js';
import { registerRunRoutes } from './runRoutes.js';
import { registerParseRoutes } from './parseRoutes.js';
import { registerAnnotationRoutes } from './annotationRoutes.js';
import { registerEnvRoutes } from './envRoutes.js';
import { registerTerminalRoutes } from './terminalRoutes.js';
import { registerStateRoutes } from './stateRoutes.js';
import { registerOverlayRoutes } from './overlayRoutes.js';
import { getServerPort } from './config.js';

const PORT = getServerPort();

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
await registerOverlayRoutes(app);

await app.register(fastifyStatic, {
  root: path.join(process.cwd(), 'frontend'),
  prefix: '/',
});

app.get('/api/health', async () => ({ status: 'ok' }));

// A fresh server process must not inherit tmux sessions from a previous one —
// their PTY bridges are gone, so the sessions are orphans. Kill them. Sessions
// are intentionally NOT preserved across server restarts (design decision).
if (isTmuxAvailable()) {
  const killed = sweepStaleSessions('overgds-');
  if (killed > 0) app.log.info(`[terminal] swept ${killed} stale tmux session(s) on startup`);
}

app.listen({ port: PORT }, (err, addr) => {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
  console.log(`overGDS Studio running at http://localhost:${PORT}`);
});
