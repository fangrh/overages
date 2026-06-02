import { test, Page } from '@playwright/test';

// Take screenshots at key drag moments to visually verify behavior
test('QA visual: screenshot during LEFT and RIGHT drag', async ({ page }) => {
  await page.goto('http://localhost:3000');
  await page.waitForLoadState('networkidle');

  async function getCenter() {
    return page.evaluate(() => {
      const h = document.getElementById('resize-handle')!;
      const r = h.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
  }

  async function screenshot(name: string) {
    await page.screenshot({ path: `/tmp/drag-${name}.png` });
    const state = await page.evaluate(() => ({
      editorW: document.getElementById('editor-pane')!.getBoundingClientRect().width,
      handleLeft: document.getElementById('resize-handle')!.style.left,
      viewerW: document.getElementById('viewer-pane')!.getBoundingClientRect().width,
      panelsW: document.getElementById('panels')!.getBoundingClientRect().width,
    }));
    console.log(`${name}: editor=${state.editorW} handleLeft=${state.handleLeft} viewer=${state.viewerW} panels=${state.panelsW}`);
    return state;
  }

  // Initial
  let state = await screenshot('initial');

  // === LEFT drag ===
  let center = await getCenter();
  console.log('\n--- LEFT drag ---');
  await page.mouse.move(center.x, center.y);
  await page.mouse.down();
  await page.waitForTimeout(50);
  await screenshot('left-after-mousedown');

  for (let step = 1; step <= 5; step++) {
    await page.mouse.move(center.x - step * 20, center.y, { steps: 3 });
    await page.waitForTimeout(30);
    await screenshot(`left-drag-${step*20}`);
  }

  await page.mouse.up();
  await page.waitForTimeout(300);
  await screenshot('left-after-release');

  // === RIGHT drag ===
  center = await getCenter();
  console.log('\n--- RIGHT drag ---');
  console.log('Handle center after LEFT:', center);
  await page.mouse.move(center.x, center.y);
  await page.mouse.down();
  await page.waitForTimeout(50);
  await screenshot('right-after-mousedown');

  for (let step = 1; step <= 5; step++) {
    await page.mouse.move(center.x + step * 20, center.y, { steps: 3 });
    await page.waitForTimeout(30);
    await screenshot(`right-drag-${step*20}`);
  }

  await page.mouse.up();
  await page.waitForTimeout(300);
  await screenshot('right-after-release');
});
