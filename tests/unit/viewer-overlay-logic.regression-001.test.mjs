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

function overlay(patch) {
  return {
    id: patch.id,
    fileName: patch.fileName || patch.id + '.png',
    assetPath: '.overgds-overlays/assets/' + patch.id + '.png',
    mimeType: 'image/png',
    imageSize: { widthPx: 1, heightPx: 1 },
    registeredAssetPath: null,
    registeredBoundsUm: null,
    registeredImageSize: null,
    opacity: 0.5,
    visible: true,
    transform: null,
    stale: { status: 'unknown', reasons: [] },
    createdAt: '2026-06-20T00:00:00.000Z',
    updatedAt: '2026-06-20T00:00:00.000Z',
    ...patch
  };
}

test('preferredOverlay restores newest registered overlay before older imported overlays', async () => {
  // Regression: ISSUE-002 - viewer reload selected the oldest unregistered overlay.
  // Found by /qa on 2026-06-21.
  // Report: .gstack/qa-reports/qa-report-localhost-4173-2026-06-21.md
  const logic = await loadLogic();
  const staleImport = overlay({
    id: 'ov_old_import',
    createdAt: '2026-06-20T10:42:45.957Z',
    updatedAt: '2026-06-20T10:42:45.957Z'
  });
  const olderRegistered = overlay({
    id: 'ov_old_registered',
    registeredAssetPath: '.overgds-overlays/registered/ov_old_registered.png',
    registeredBoundsUm: [0, 0, 1, 1],
    transform: { confidence: 'high' },
    createdAt: '2026-06-20T10:43:12.183Z',
    updatedAt: '2026-06-20T10:43:13.266Z'
  });
  const newestRegistered = overlay({
    id: 'ov_new_registered',
    registeredAssetPath: '.overgds-overlays/registered/ov_new_registered.png',
    registeredBoundsUm: [0, 0, 2, 2],
    transform: { confidence: 'high' },
    createdAt: '2026-06-20T10:48:12.832Z',
    updatedAt: '2026-06-20T10:48:14.011Z'
  });

  assert.equal(logic.preferredOverlay([staleImport, olderRegistered, newestRegistered]).id, 'ov_new_registered');
});

test('preferredOverlay falls back to newest imported overlay when none are registered', async () => {
  const logic = await loadLogic();
  const olderImport = overlay({
    id: 'ov_old_import',
    updatedAt: '2026-06-20T10:42:45.957Z'
  });
  const newerImport = overlay({
    id: 'ov_new_import',
    updatedAt: '2026-06-20T10:46:18.197Z'
  });

  assert.equal(logic.preferredOverlay([olderImport, newerImport]).id, 'ov_new_import');
});
