import { test, expect } from '@playwright/test';

test.describe('gdsViewerInteraction', () => {
  test('gds viewer iframe is loadable', async ({ page }) => {
    await page.goto('http://localhost:3000');
    const iframe = page.locator('#gds-viewer');
    await expect(iframe).toBeVisible();

    // Check that iframe has loaded the viewer.html
    // by waiting for the iframe to be ready
    await page.waitForTimeout(3000);

    const iframeSrc = await iframe.getAttribute('src');
    expect(iframeSrc).toContain('viewer.html');
  });
});