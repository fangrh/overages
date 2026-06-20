import type { FastifyInstance, FastifyReply } from 'fastify';

import {
  createImageOverlayFromBuffer,
  listImageOverlays,
  loadImageOverlay,
  patchImageOverlay,
  resolveOverlayAssetPath,
} from '../lib/overlays.js';
import { fitAffineTransform, fitSimilarityTransform } from '../lib/registration.js';
import { CorrespondenceSchema } from '../lib/overlaySchemas.js';
import { warpOverlayToRegisteredAsset } from '../lib/warpOverlay.js';
import { getWorkspacePath } from './workspace.js';
import fs from 'fs/promises';

function actionableError(reply: FastifyReply, statusCode: number, problem: string, cause: string, fix: string) {
  reply.code(statusCode);
  return { error: { problem, cause, fix } };
}

function decodeBase64Image(body: any): { fileName: string; mimeType: string; buffer: Buffer } {
  const fileName = typeof body?.fileName === 'string' ? body.fileName : '';
  const mimeType = typeof body?.mimeType === 'string' ? body.mimeType : '';
  const contentBase64 = typeof body?.contentBase64 === 'string' ? body.contentBase64 : '';
  if (!fileName || !mimeType || !contentBase64) {
    throw new Error('fileName, mimeType, and contentBase64 are required');
  }
  if (!mimeType.startsWith('image/')) {
    throw new Error(`Unsupported image MIME type: ${mimeType}`);
  }
  return {
    fileName,
    mimeType,
    buffer: Buffer.from(contentBase64, 'base64'),
  };
}

export async function registerOverlayRoutes(app: FastifyInstance) {
  app.get('/api/image-overlays', async () => {
    const workspace = getWorkspacePath();
    return { overlays: await listImageOverlays(workspace) };
  });

  app.post('/api/image-overlays', async (req, reply) => {
    try {
      const workspace = getWorkspacePath();
      const image = decodeBase64Image(req.body);
      const overlay = await createImageOverlayFromBuffer(workspace, image);
      return { overlay };
    } catch (err) {
      return actionableError(
        reply,
        400,
        'Could not import microscopy image',
        err instanceof Error ? err.message : 'Invalid image payload',
        'Choose a supported image file and retry the import from the overlay rail.',
      );
    }
  });

  app.get<{ Params: { id: string }; Querystring: { kind?: string } }>('/api/image-overlays/:id/image', async (req, reply) => {
    try {
      const workspace = getWorkspacePath();
      const overlay = await loadImageOverlay(workspace, req.params.id);
      const useRegistered = req.query.kind === 'registered';
      const filePath = useRegistered && overlay.registeredAssetPath
        ? resolveOverlayAssetPath(workspace, { assetPath: overlay.registeredAssetPath })
        : resolveOverlayAssetPath(workspace, overlay);
      const data = await fs.readFile(filePath);
      reply.header('content-type', useRegistered ? 'image/png' : overlay.mimeType);
      return reply.send(data);
    } catch (err) {
      return actionableError(
        reply,
        404,
        'Could not load microscopy image asset',
        err instanceof Error ? err.message : 'Overlay image not found',
        'Re-import the image or remove the stale overlay metadata.',
      );
    }
  });

  app.patch<{ Params: { id: string } }>('/api/image-overlays/:id', async (req, reply) => {
    try {
      const workspace = getWorkspacePath();
      const overlay = await patchImageOverlay(workspace, req.params.id, req.body);
      return { overlay };
    } catch (err) {
      return actionableError(
        reply,
        400,
        'Could not update microscopy overlay',
        err instanceof Error ? err.message : 'Invalid overlay patch',
        'Only update allowed overlay fields such as opacity, visibility, transform, or stale state.',
      );
    }
  });

  app.post<{ Params: { id: string } }>('/api/image-overlays/:id/register', async (req, reply) => {
    try {
      const body = req.body as any;
      const type = body?.type === 'similarity' ? 'similarity' : 'affine';
      const correspondences = CorrespondenceSchema.array().parse(body?.correspondences ?? []);
      const transform = type === 'similarity'
        ? fitSimilarityTransform(correspondences)
        : fitAffineTransform(correspondences);
      const workspace = getWorkspacePath();
      const existing = await loadImageOverlay(workspace, req.params.id);
      const registered = await warpOverlayToRegisteredAsset(workspace, {
        ...existing,
        transform,
      });
      const overlay = await patchImageOverlay(workspace, req.params.id, {
        transform,
        stale: { status: 'fresh', reasons: [] },
        ...registered,
      });
      return { overlay };
    } catch (err) {
      return actionableError(
        reply,
        400,
        'Could not register microscopy image to GDS',
        err instanceof Error ? err.message : 'Invalid correspondence set',
        'Check for duplicate, missing, or collinear point pairs, then fit again.',
      );
    }
  });
}
