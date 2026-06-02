import { test, expect } from '@playwright/test';

test('clicking @file:line in source panel triggers jumpToSource in editor', async ({ page }) => {
  const consoleMessages: string[] = [];
  page.on('console', msg => consoleMessages.push(`[${msg.type()}] ${msg.text()}`));

  await page.goto('http://localhost:3000');
  await page.waitForTimeout(5000);

  expect(await page.evaluate(() => !!(window as any).studio)).toBe(true);
  expect(await page.evaluate(() => !!(window as any).monaco)).toBe(true);

  await page.evaluate(() => {
    (window as any).__msgs = [];
    window.addEventListener('message', (e: MessageEvent) => {
      (window as any).__msgs.push(e.data);
    });
  });

  const iframe = page.locator('#gds-viewer');
  await iframe.waitFor({ state: 'visible' });
  await page.waitForTimeout(2000);

  const mockGeoJson = {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [[[0,0],[400,0],[400,400],[0,400],[0,0]]] },
      properties: { layer: 'METAL', data_type: 1, provenance: { file: 'test.py', line: 42, cell: 'TEST_CELL' } }
    }]
  };

  await page.evaluate((geojson: any) => {
    const iframe = document.getElementById('gds-viewer') as HTMLIFrameElement;
    iframe.contentWindow.postMessage({ type: 'loadGds', geojson, gdsPath: '/test.gds', pythonFile: 'test.py', annotations: [], mode: 'standalone' }, '*');
  }, mockGeoJson);
  await page.waitForTimeout(3000);

  // Trigger selection to populate source panel
  await page.evaluate(() => {
    const iframe = document.getElementById('gds-viewer') as HTMLIFrameElement;
    const cw = iframe.contentWindow as any;
    const layers = cw.map.getLayers().getArray();
    for (const layer of layers) {
      const source = layer.getSource && layer.getSource();
      if (source && source.getFeatures) {
        const feats = source.getFeatures();
        if (feats && feats.length > 0) {
          cw.selectedFeatures.push(feats[0]);
          cw.onSelectionChanged();
          break;
        }
      }
    }
  });
  await page.waitForTimeout(1000);

  // Verify source panel populated
  const sourceHTML = await page.evaluate(() => document.getElementById('terminal-source-panel')?.innerHTML || 'NOT_FOUND');
  expect(sourceHTML).toContain('@test.py:42');
  expect(sourceHTML).toContain('source-jump');
  console.log('Source panel populated correctly');

  // Now simulate clicking on the source-jump element in the source panel
  // This should call window.postMessage({type: 'jumpToSource', file: 'test.py', line: 42})
  await page.evaluate(() => {
    const sourcePanel = document.getElementById('terminal-source-panel');
    const jumpEl = sourcePanel?.querySelector('.source-jump');
    if (jumpEl) {
      console.log('[TEST] Clicking source-jump element');
      (jumpEl as HTMLElement).click();
    } else {
      console.log('[TEST] source-jump element not found');
    }
  });
  
  await page.waitForTimeout(500);

  // Check if jumpToSource message was posted
  const captured = await page.evaluate(() => (window as any).__msgs || []);
  console.log('\nMessages after click:', captured.map((m: any) => `${m?.type}(${m?.file || ''}:${m?.line || ''})`));

  const jumpMsg = captured.find((m: any) => m && m.type === 'jumpToSource');
  console.log('jumpToSource message:', jumpMsg ? `${jumpMsg.file}:${jumpMsg.line}` : 'NOT FOUND');
  
  expect(jumpMsg).toBeDefined();
  expect(jumpMsg.file).toBe('test.py');
  expect(jumpMsg.line).toBe(42);
});
