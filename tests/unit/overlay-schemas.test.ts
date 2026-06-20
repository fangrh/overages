import test from 'node:test';
import assert from 'node:assert/strict';

import { ImageOverlaySchema, normalizeOverlayPatch } from '../../lib/overlaySchemas.js';

test('ImageOverlaySchema accepts project-local overlay metadata with explicit um units', () => {
  const overlay = ImageOverlaySchema.parse({
    id: 'ov_test',
    fileName: 'flake.png',
    assetPath: '.overgds-overlays/assets/ov_test.png',
    mimeType: 'image/png',
    imageSize: { widthPx: 640, heightPx: 480 },
    opacity: 0.5,
    visible: true,
    transform: {
      type: 'affine',
      matrix: [2, 0, 10, 0, 2, -5],
      inverseMatrix: [0.5, 0, -5, 0, 0.5, 2.5],
      residualRmsUm: 0.25,
      maxResidualUm: 0.5,
      pairCount: 3,
      confidence: 'high',
      correspondences: [
        { imagePx: [0, 0], gdsUm: [10, -5], source: 'manual' },
        { imagePx: [10, 0], gdsUm: [30, -5], source: 'manual' },
        { imagePx: [0, 10], gdsUm: [10, 15], source: 'manual' },
      ],
    },
    stale: { status: 'fresh', reasons: [] },
    createdAt: '2026-06-20T00:00:00.000Z',
    updatedAt: '2026-06-20T00:00:00.000Z',
  });

  assert.equal(overlay.transform?.correspondences[0].imagePx[0], 0);
  assert.equal(overlay.transform?.correspondences[0].gdsUm[0], 10);
});

test('normalizeOverlayPatch rejects invalid opacity and path mutation', () => {
  assert.deepEqual(normalizeOverlayPatch({ opacity: 0.75, visible: false }), {
    opacity: 0.75,
    visible: false,
  });

  assert.throws(() => normalizeOverlayPatch({ opacity: Number.NaN }), /opacity/i);
  assert.throws(() => normalizeOverlayPatch({ assetPath: '../outside.png' }), /not allowed/i);
  assert.throws(() => normalizeOverlayPatch({ registeredAssetPath: '../outside.png' }), /registeredAssetPath/i);
});
