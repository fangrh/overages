import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';

import { registerOverlayRoutes } from '../../server/overlayRoutes.js';
import { setWorkspacePath } from '../../server/workspace.js';

const stateFile = path.join(process.cwd(), '.supergds-state.json');
let priorState: string | null = null;
const tempRoots: string[] = [];

before(() => {
  priorState = fs.existsSync(stateFile) ? fs.readFileSync(stateFile, 'utf-8') : null;
});

after(async () => {
  if (priorState === null) {
    fs.rmSync(stateFile, { force: true });
  } else {
    fs.writeFileSync(stateFile, priorState, 'utf-8');
  }
  await Promise.all(tempRoots.map((root) => rm(root, { recursive: true, force: true })));
});

function tinyPngBase64(): string {
  return 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=';
}

async function testApp() {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'overgds-overlay-routes-'));
  tempRoots.push(workspace);
  await setWorkspacePath(workspace);
  const app = Fastify({ logger: false });
  await registerOverlayRoutes(app);
  return { app, workspace };
}

async function createOverlay(app: Fastify.FastifyInstance) {
  const response = await app.inject({
    method: 'POST',
    url: '/api/image-overlays',
    payload: {
      fileName: 'flake.png',
      mimeType: 'image/png',
      contentBase64: tinyPngBase64(),
    },
  });
  assert.equal(response.statusCode, 200, response.body);
  return response.json().overlay;
}

test('POST /api/image-overlays imports image metadata into workspace storage', async () => {
  const { app, workspace } = await testApp();
  const overlay = await createOverlay(app);

  assert.equal(overlay.fileName, 'flake.png');
  assert.deepEqual(overlay.imageSize, { widthPx: 1, heightPx: 1 });
  assert.equal(fs.existsSync(path.join(workspace, overlay.assetPath)), true);

  const listResponse = await app.inject({ method: 'GET', url: '/api/image-overlays' });
  assert.equal(listResponse.statusCode, 200);
  assert.deepEqual(listResponse.json().overlays.map((item: any) => item.id), [overlay.id]);
});

test('POST /api/image-overlays accepts microscope-scale image payloads', async () => {
  const { app, workspace } = await testApp();
  const microscopePayload = Buffer.alloc(1_500_000, 0xab);

  const response = await app.inject({
    method: 'POST',
    url: '/api/image-overlays',
    payload: {
      fileName: 'large-flake.jpg',
      mimeType: 'image/jpeg',
      contentBase64: microscopePayload.toString('base64'),
    },
  });

  assert.equal(response.statusCode, 200, response.body);
  const overlay = response.json().overlay;
  assert.equal(overlay.fileName, 'large-flake.jpg');
  assert.equal(overlay.imageSize, null);
  assert.equal(fs.existsSync(path.join(workspace, overlay.assetPath)), true);
});

test('PATCH /api/image-overlays/:id updates opacity and rejects invalid patches with actionable error', async () => {
  const { app } = await testApp();
  const overlay = await createOverlay(app);

  const patchResponse = await app.inject({
    method: 'PATCH',
    url: `/api/image-overlays/${overlay.id}`,
    payload: { opacity: 0.25, visible: false },
  });
  assert.equal(patchResponse.statusCode, 200, patchResponse.body);
  assert.equal(patchResponse.json().overlay.opacity, 0.25);
  assert.equal(patchResponse.json().overlay.visible, false);

  const invalidResponse = await app.inject({
    method: 'PATCH',
    url: `/api/image-overlays/${overlay.id}`,
    payload: { assetPath: '../outside.png' },
  });
  assert.equal(invalidResponse.statusCode, 400);
  assert.deepEqual(Object.keys(invalidResponse.json().error).sort(), ['cause', 'fix', 'problem'].sort());
});

test('POST /api/image-overlays/:id/register fits transform and persists confidence', async () => {
  const { app, workspace } = await testApp();
  const overlay = await createOverlay(app);

  const response = await app.inject({
    method: 'POST',
    url: `/api/image-overlays/${overlay.id}/register`,
    payload: {
      type: 'affine',
      correspondences: [
        { imagePx: [0, 0], gdsUm: [0, 0], source: 'manual' },
        { imagePx: [1, 0], gdsUm: [1, 0], source: 'manual' },
        { imagePx: [0, 1], gdsUm: [0, 1], source: 'manual' },
      ],
    },
  });

  assert.equal(response.statusCode, 200, response.body);
  const registered = response.json().overlay;
  assert.equal(registered.transform.type, 'affine');
  assert.equal(registered.transform.confidence, 'high');
  assert.equal(registered.transform.residualRmsUm, 0);
  assert.match(registered.registeredAssetPath, /^\.overgds-overlays\/registered\/.+\.png$/);
  assert.deepEqual(registered.registeredBoundsUm, [0, 0, 1, 1]);
  assert.equal(fs.existsSync(path.join(workspace, registered.registeredAssetPath)), true);

  const listResponse = await app.inject({ method: 'GET', url: '/api/image-overlays' });
  assert.equal(listResponse.json().overlays[0].transform.confidence, 'high');
});
