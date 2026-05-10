import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { loadAnnotations, saveAnnotation, deleteAnnotation } from '../lib/annotations.js';

export async function registerAnnotationRoutes(app: FastifyInstance) {
  app.get<{ Params: { pythonFile: string } }>('/:pythonFile', async (req) => {
    const annotations = await loadAnnotations(req.params.pythonFile);
    return { annotations };
  });

  app.post<{ Params: { pythonFile: string } }>('/:pythonFile', async (req) => {
    const { jsonPath, shape, layer } = req.body as any;
    await saveAnnotation(req.params.pythonFile, { jsonPath, shape, layer });
    return { success: true };
  });

  app.delete<{ Params: { pythonFile: string } }>('/:pythonFile', async (req) => {
    const { jsonPath } = req.body as { jsonPath: string };
    await deleteAnnotation(req.params.pythonFile, jsonPath);
    return { success: true };
  });
}