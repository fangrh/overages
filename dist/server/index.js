import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import path from 'path';
import { registerFileRoutes } from './fileRoutes.js';
import { registerRunRoutes } from './runRoutes.js';
import { registerParseRoutes } from './parseRoutes.js';
import { registerAnnotationRoutes } from './annotationRoutes.js';
const PORT = 3000;
const app = Fastify({ logger: true });
await app.register(cors, {
    origin: true,
    credentials: true,
});
await registerFileRoutes(app);
await registerRunRoutes(app);
await registerParseRoutes(app);
await registerAnnotationRoutes(app);
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
    console.log(`superGDS Studio running at http://localhost:${PORT}`);
});
