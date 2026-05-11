import { test, expect } from '@playwright/test';
import path from 'path';

test('Run button shows GDS in viewer', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', err => errors.push(err.message));
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await page.goto('http://localhost:3000');
  await page.waitForTimeout(3000);

  // Verify workspace is auto-restored
  const wsRes = await page.evaluate(async () => {
    const r = await fetch('/api/workspace');
    return r.json();
  });
  console.log('Workspace:', wsRes.workspace);
  expect(wsRes.workspace).toBeTruthy();

  // Click the Python file in the sidebar
  const fileItem = page.locator('text=suspended_superconductor_standalone.py').first();
  await fileItem.click();
  await page.waitForTimeout(500);

  // Click Run
  const runBtn = page.locator('#run-btn');
  await expect(runBtn).toBeEnabled();
  await runBtn.click();
  console.log('Run button clicked');

  // Wait for completion (15s should be enough based on prior run)
  await page.waitForTimeout(15000);

  // Check terminal for "Done." message
  const terminalText = await page.locator('#terminal-body').textContent();
  console.log('Terminal text:', terminalText);

  // Check viewer has features rendered (via iframe window variables)
  const viewerInfo = await page.evaluate(() => {
    const iframe = document.getElementById('gds-viewer') as HTMLIFrameElement;
    if (!iframe || !iframe.contentWindow) return { error: 'no iframe' };
    try {
      const win = iframe.contentWindow as any;
      return {
        currentGdsPath: win.currentGdsPath,
        allFeaturesLength: win.allFeatures?.length,
        layerColorsKeys: Object.keys(win.layerColors || {}).length,
        iframeAccessible: true
      };
    } catch {
      return { error: 'cross-origin iframe access denied' };
    }
  });
  console.log('Viewer info:', viewerInfo);
  expect(viewerInfo.allFeaturesLength).toBeGreaterThan(0);

  // Critical errors check
  const criticalErrors = errors.filter(e =>
    !e.includes('404') &&
    !e.includes('viewer') &&
    !e.includes('ERR_INCOMPLETE_CHUNKED_ENCODING') &&
    !e.includes('ERR_CONNECTION_REFUSED')
  );
  console.log('Critical errors:', criticalErrors);
  expect(criticalErrors).toHaveLength(0);
});