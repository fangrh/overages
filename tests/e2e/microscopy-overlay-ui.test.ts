import { expect, test } from '@playwright/test';

const tinyPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
  'base64',
);

test('viewer overlay rail imports an image and activates a registered raster layer', async ({ page }) => {
  await page.route('**/api/image-overlays', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { overlays: [] } });
      return;
    }
    await route.fulfill({
      json: {
        overlay: {
          id: 'ov_test',
          fileName: 'flake.png',
          assetPath: '.overgds-overlays/assets/ov_test.png',
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
        },
      },
    });
  });

  await page.goto('/viewer/viewer.html');
  await expect(page.locator('#overlay-rail')).toBeVisible();
  await expect(page.locator('#overlay-status')).toContainText('No image');

  await page.setInputFiles('#overlay-file-input', {
    name: 'flake.png',
    mimeType: 'image/png',
    buffer: tinyPng,
  });

  await expect(page.locator('#overlay-file-name')).toContainText('flake.png');
  await expect(page.locator('#overlay-status')).toContainText('Imported, not registered');
  await expect(page.locator('#overlay-opacity')).toBeDisabled();

  await page.evaluate(() => {
    (window as any).__overgdsSetActiveOverlay({
      id: 'ov_test',
      fileName: 'flake.png',
      assetPath: '.overgds-overlays/assets/ov_test.png',
      mimeType: 'image/png',
      imageSize: { widthPx: 1, heightPx: 1 },
      registeredAssetPath: '.overgds-overlays/registered/ov_test.png',
      registeredBoundsUm: [0, 0, 1, 1],
      registeredImageSize: { widthPx: 1, heightPx: 1 },
      opacity: 0.5,
      visible: true,
      transform: {
        type: 'affine',
        matrix: [1, 0, 0, 0, 1, 0],
        inverseMatrix: [1, 0, 0, 0, 1, 0],
        residualRmsUm: 0,
        maxResidualUm: 0,
        pairCount: 3,
        confidence: 'high',
        correspondences: [],
      },
      stale: { status: 'fresh', reasons: [] },
      createdAt: '2026-06-20T00:00:00.000Z',
      updatedAt: '2026-06-20T00:00:00.000Z',
    });
  });

  await expect(page.locator('#overlay-status')).toContainText('High confidence');
  await expect(page.locator('#overlay-opacity')).toBeEnabled();
  await expect.poll(async () => page.evaluate(() => (window as any).__overgdsOverlayImageLayerState())).toEqual({
    extent: [0, 0, 1, 1],
    opacity: 0.5,
    visible: true,
  });
});
