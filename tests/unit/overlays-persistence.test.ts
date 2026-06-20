import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  createImageOverlayFromBuffer,
  listImageOverlays,
  loadImageOverlay,
  patchImageOverlay,
  resolveOverlayAssetPath,
} from '../../lib/overlays.js';

const tempRoots: string[] = [];

after(async () => {
  await Promise.all(tempRoots.map((root) => rm(root, { recursive: true, force: true })));
});

function tinyPngBuffer(): Buffer {
  return Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
    'base64',
  );
}

async function tempWorkspace(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'overgds-overlays-'));
  tempRoots.push(root);
  return root;
}

test('createImageOverlayFromBuffer writes project-local asset and metadata', async () => {
  const workspace = await tempWorkspace();
  const overlay = await createImageOverlayFromBuffer(workspace, {
    fileName: 'flake.png',
    mimeType: 'image/png',
    buffer: tinyPngBuffer(),
  });

  assert.equal(overlay.fileName, 'flake.png');
  assert.equal(overlay.mimeType, 'image/png');
  assert.equal(overlay.opacity, 0.5);
  assert.equal(overlay.visible, true);
  assert.deepEqual(overlay.imageSize, { widthPx: 1, heightPx: 1 });
  assert.match(overlay.assetPath, /^\.overgds-overlays\/assets\/.+\.png$/);

  const loaded = await loadImageOverlay(workspace, overlay.id);
  assert.deepEqual(loaded, overlay);

  const assetPath = resolveOverlayAssetPath(workspace, overlay);
  assert.equal(assetPath.startsWith(workspace), true);
});

test('patchImageOverlay updates allowed fields without changing asset path', async () => {
  const workspace = await tempWorkspace();
  const overlay = await createImageOverlayFromBuffer(workspace, {
    fileName: 'flake.png',
    mimeType: 'image/png',
    buffer: tinyPngBuffer(),
  });

  const patched = await patchImageOverlay(workspace, overlay.id, { opacity: 0.25, visible: false });

  assert.equal(patched.opacity, 0.25);
  assert.equal(patched.visible, false);
  assert.equal(patched.assetPath, overlay.assetPath);
  assert.notEqual(patched.updatedAt, overlay.updatedAt);

  const listed = await listImageOverlays(workspace);
  assert.deepEqual(listed.map((item) => item.id), [overlay.id]);
});
