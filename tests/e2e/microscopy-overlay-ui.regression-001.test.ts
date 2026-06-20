import { expect, test } from '@playwright/test';

const tinyPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
  'base64',
);

function imageOverlay(patch: Record<string, unknown>) {
  return {
    id: patch.id,
    fileName: `${patch.id}.png`,
    assetPath: `.overgds-overlays/assets/${patch.id}.png`,
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
    ...patch,
  };
}

test('viewer overlay rail restores newest registered overlay on load', async ({ page }) => {
  // Regression: ISSUE-002 - viewer reload selected the oldest unregistered overlay.
  // Found by /qa on 2026-06-21.
  // Report: .gstack/qa-reports/qa-report-localhost-4173-2026-06-21.md
  await page.route('**/api/image-overlays/*/image*', async (route) => {
    await route.fulfill({ contentType: 'image/png', body: tinyPng });
  });
  await page.route('**/api/image-overlays', async (route) => {
    await route.fulfill({
      json: {
        overlays: [
          imageOverlay({
            id: 'ov_old_import',
            fileName: 'old-import.png',
            createdAt: '2026-06-20T10:42:45.957Z',
            updatedAt: '2026-06-20T10:42:45.957Z',
          }),
          imageOverlay({
            id: 'ov_new_registered',
            fileName: 'registered-flake.png',
            registeredAssetPath: '.overgds-overlays/registered/ov_new_registered.png',
            registeredBoundsUm: [10, 20, 30, 40],
            registeredImageSize: { widthPx: 1, heightPx: 1 },
            opacity: 0.72,
            transform: {
              type: 'affine',
              matrix: [1, 0, 0, 0, 1, 0],
              inverseMatrix: [1, 0, 0, 0, 1, 0],
              residualRmsUm: 0.4,
              maxResidualUm: 1.2,
              pairCount: 3,
              confidence: 'high',
              correspondences: [],
            },
            stale: { status: 'fresh', reasons: [] },
            createdAt: '2026-06-20T10:48:12.832Z',
            updatedAt: '2026-06-20T10:48:14.011Z',
          }),
        ],
      },
    });
  });

  await page.goto('/viewer/viewer.html');

  await expect(page.locator('#overlay-file-name')).toContainText('registered-flake.png');
  await expect(page.locator('#overlay-status')).toContainText('High confidence');
  await expect(page.locator('#overlay-opacity')).toBeEnabled();
  await expect.poll(async () => page.evaluate(() => (window as any).__overgdsOverlayImageLayerState())).toEqual({
    extent: [10, 20, 30, 40],
    opacity: 0.72,
    visible: true,
  });
});
