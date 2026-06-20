import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

async function loadLogic() {
  const source = await readFile(new URL('../../frontend/viewer/overlayLogic.js', import.meta.url), 'utf8');
  const sandbox = { console };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  return sandbox.OverGDSOverlayLogic;
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

test('fitReadiness enables similarity after 2 pairs and affine after 3 pairs', async () => {
  const logic = await loadLogic();
  const pairs = [
    { imagePx: [0, 0], gdsUm: [0, 0], source: 'manual' },
    { imagePx: [1, 0], gdsUm: [1, 0], source: 'manual' },
  ];

  assert.deepEqual(plain(logic.fitReadiness(pairs, 'similarity')), { ready: true, needed: 0 });
  assert.deepEqual(plain(logic.fitReadiness(pairs, 'affine')), { ready: false, needed: 1 });
});

test('confidenceSummary exposes severity and activation rule', async () => {
  const logic = await loadLogic();

  assert.equal(logic.confidenceSummary(null).label, 'Not registered');
  assert.deepEqual(plain(logic.confidenceSummary({ confidence: 'high', residualRmsUm: 0.4, maxResidualUm: 1.2 })), {
    tone: 'high',
    label: 'High confidence',
    detail: 'RMS 0.40 um, max 1.20 um',
    requiresAcceptance: false,
  });
  assert.equal(logic.confidenceSummary({ confidence: 'low', residualRmsUm: 12, maxResidualUm: 30 }).requiresAcceptance, true);
});

test('registeredImageModel prefers registered raster and stable opacity percent', async () => {
  const logic = await loadLogic();
  const model = logic.registeredImageModel({
    id: 'ov_test',
    opacity: 0.333,
    visible: true,
    registeredAssetPath: '.overgds-overlays/registered/ov_test.png',
    registeredBoundsUm: [0, 0, 10, 20],
  });

  assert.equal(model.url, '/api/image-overlays/ov_test/image?kind=registered');
  assert.deepEqual(model.extent, [0, 0, 10, 20]);
  assert.equal(model.opacityPercent, 33);
});
