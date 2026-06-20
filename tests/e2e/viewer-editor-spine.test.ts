import { expect, test } from '@playwright/test';

test('rectangle draw tool stays active after drawend', async ({ page }) => {
  await page.goto('/viewer/viewer.html');
  await page.waitForFunction(() => Boolean((window as any).drawInteractions?.rectangle));

  await page.evaluate(() => {
    const w = window as any;
    w.setMode('rectangle');
    const feature = new w.ol.Feature({
      geometry: new w.ol.geom.Polygon([[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]]),
    });
    w.drawInteractions.rectangle.dispatchEvent({ type: 'drawend', feature });
  });

  await page.waitForTimeout(100);

  await expect.poll(async () => page.evaluate(() => {
    const w = window as any;
    return w.editorState?.activeTool || w.currentMode;
  })).toBe('rectangle');
});

test('selection helper exposes Shift-drag box and plain-drag pan precedence', async ({ page }) => {
  await page.goto('/viewer/viewer.html');
  await page.waitForFunction(() => Boolean((window as any).ViewerEditorLogic));

  const result = await page.evaluate(() => {
    const logic = (window as any).ViewerEditorLogic;
    return {
      plain: logic.shouldStartBoxSelect({ activeTool: 'select' }, {}),
      shift: logic.shouldStartBoxSelect({ activeTool: 'select' }, { shiftKey: true }),
      drawShift: logic.shouldStartBoxSelect({ activeTool: 'rectangle' }, { shiftKey: true }),
    };
  });

  expect(result).toEqual({ plain: false, shift: true, drawShift: false });
});

test('plain clicks cycle through overlapping selectable features', async ({ page }) => {
  await page.goto('/viewer/viewer.html');
  await page.waitForFunction(() => Boolean((window as any).map && (window as any).source));

  const clickPoint = await page.evaluate(async () => {
    const w = window as any;
    const makeFeature = (name: string) => {
      const feature = new w.ol.Feature({
        geometry: new w.ol.geom.Polygon([[[0, 0], [20, 0], [20, 20], [0, 20], [0, 0]]]),
      });
      feature.set('layer', '1/0');
      feature.set('layerKey', '1/0');
      feature.set('color', '#89b4fa');
      feature.set('provenance', { instance_name: name, file: 'overlap.py', line: 7 });
      return feature;
    };

    const first = makeFeature('first');
    const second = makeFeature('second');
    w.source.addFeature(first);
    w.source.addFeature(second);
    w.allFeatures.push(first, second);
    w.map.getView().fit([0, 0, 20, 20], { size: w.map.getSize(), padding: [80, 80, 80, 80] });
    w.map.renderSync();
    await new Promise((resolve) => requestAnimationFrame(resolve));

    const pixel = w.map.getPixelFromCoordinate([10, 10]);
    const rect = w.map.getTargetElement().getBoundingClientRect();
    return { x: rect.left + pixel[0], y: rect.top + pixel[1] };
  });

  await page.mouse.click(clickPoint.x, clickPoint.y);
  await page.waitForFunction(() => (window as any).selectedFeatures.getLength() === 1);
  const selectedFirst = await page.evaluate(() => {
    const w = window as any;
    return w.selectedFeatures.getArray()[0]?.get('provenance')?.instance_name;
  });

  await page.mouse.click(clickPoint.x, clickPoint.y);
  await page.waitForFunction((first) => {
    const w = window as any;
    const selected = w.selectedFeatures.getArray()[0]?.get('provenance')?.instance_name;
    return selected && selected !== first;
  }, selectedFirst);
  const result = await page.evaluate((selectedFirst) => {
    const w = window as any;
    const selectedSecond = w.selectedFeatures.getArray()[0]?.get('provenance')?.instance_name;

    return {
      selectedFirst,
      selectedSecond,
      status: document.getElementById('editor-status')?.textContent || '',
    };
  }, selectedFirst);

  expect([result.selectedFirst, result.selectedSecond].sort()).toEqual(['first', 'second']);
  expect(result.status).toContain('Overlap 2/2');
});
