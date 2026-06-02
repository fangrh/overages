import { test, expect } from '@playwright/test';

test('polygon click flow: selectComponents → updateTerminalPanels', async ({ page }) => {
  const consoleMessages: string[] = [];
  page.on('console', msg => consoleMessages.push(`[${msg.type()}] ${msg.text()}`));

  await page.goto('http://localhost:3000');
  await page.waitForTimeout(5000);

  expect(await page.evaluate(() => !!(window as any).studio)).toBe(true);

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

  const captured = await page.evaluate(() => (window as any).__msgs || []);
  console.log('\nMessages:', captured.map((m: any) => `${m?.type}(${m?.components?.length})`));

  const sourceHTML = await page.evaluate(() => document.getElementById('terminal-source-panel')?.innerHTML || 'NOT_FOUND');
  console.log('Source panel:', sourceHTML.substring(0, 300));

  const hasSC = captured.some((m: any) => m && m.type === 'selectComponents');
  console.log('Has selectComponents:', hasSC);
  
  // Key assertion: source panel should show @test.py:42 with source-jump class
  expect(sourceHTML).toContain('@test.py:42');
  expect(sourceHTML).toContain('source-jump');
  expect(sourceHTML).not.toContain('Click a polygon');
  
  const infoHTML = await page.evaluate(() => document.getElementById('terminal-info-panel')?.innerHTML || 'NOT_FOUND');
  expect(infoHTML).toContain('METAL/1');
  expect(infoHTML).toContain('TEST_CELL');
});
