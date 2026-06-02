import { test } from '@playwright/test';

// Deep dive: RIGHT drag with forced layout and mouse capture analysis
test('QA deep: RIGHT drag with forced layout flush', async ({ page }) => {
  await page.goto('http://localhost:3000');
  await page.waitForLoadState('networkidle');

  // First do a LEFT drag to set locked state (from prev test result)
  let center = await page.evaluate(() => {
    const h = document.getElementById('resize-handle')!;
    const r = h.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });

  console.log('=== FIRST: LEFT drag ===');
  await page.mouse.move(center.x, center.y);
  await page.mouse.down();
  for (let i = 1; i <= 5; i++) {
    await page.mouse.move(center.x - i * 20, center.y, { steps: 3 });
    await page.waitForTimeout(20);
  }
  await page.mouse.up();
  await page.waitForTimeout(300);

  const afterLeft = await page.evaluate(() => {
    // Force layout flush
    (window as any).getComputedStyle(document.getElementById('viewer-pane')!).zIndex;
    const viewer = document.getElementById('viewer-pane')!;
    const vr = viewer.getBoundingClientRect();
    return {
      editorW: document.getElementById('editor-pane')!.getBoundingClientRect().width,
      handleLeft: document.getElementById('resize-handle')!.style.left,
      viewerW: vr.width,
      viewerL: vr.left,
      viewerR: vr.right,
      viewerStyleW: viewer.style.width,
      viewerComputedFlex: (window as any).getComputedStyle(viewer).flex,
      panelsW: document.getElementById('panels')!.getBoundingClientRect().width,
    };
  });
  console.log('After LEFT:', JSON.stringify(afterLeft, null, 2));

  // Now RIGHT drag
  console.log('\n=== SECOND: RIGHT drag ===');
  center = await page.evaluate(() => {
    const h = document.getElementById('resize-handle')!;
    const r = h.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  console.log('Handle center:', center);

  await page.mouse.move(center.x, center.y);
  await page.mouse.down();
  await page.waitForTimeout(50);

  for (let step = 1; step <= 5; step++) {
    const targetX = center.x + step * 20;
    await page.mouse.move(targetX, center.y, { steps: 3 });
    await page.waitForTimeout(50);

    const s = await page.evaluate(() => {
      (window as any).getComputedStyle(document.getElementById('viewer-pane')!).zIndex;
      const editor = document.getElementById('editor-pane')!;
      const viewer = document.getElementById('viewer-pane')!;
      const handle = document.getElementById('resize-handle')!;
      const panels = document.getElementById('panels')!;
      const er = editor.getBoundingClientRect();
      const vr = viewer.getBoundingClientRect();
      const hr = handle.getBoundingClientRect();
      const pr = panels.getBoundingClientRect();
      return {
        editorW: er.width,
        handleLeft: handle.style.left,
        handleR: hr.right,
        viewerW: vr.width,
        viewerL: vr.left,
        viewerR: vr.right,
        viewerStyleW: viewer.style.width,
        viewerComputedFlex: (window as any).getComputedStyle(viewer).flex,
        panelsW: pr.width,
        editorRight: er.right,
        gap: vr.left - hr.right,
      };
    });
    console.log(`+${step*20}px: editor=${s.editorW} handleLeft=${s.handleLeft} handleR=${s.handleR} viewer=${s.viewerW}(${s.viewerL}-${s.viewerR}) gap=${s.gap}px flex=${s.viewerComputedFlex}`);
  }

  await page.mouse.up();
  await page.waitForTimeout(500);
  const afterRight = await page.evaluate(() => {
    (window as any).getComputedStyle(document.getElementById('viewer-pane')!).zIndex;
    const viewer = document.getElementById('viewer-pane')!;
    const vr = viewer.getBoundingClientRect();
    return {
      editorW: document.getElementById('editor-pane')!.getBoundingClientRect().width,
      handleLeft: document.getElementById('resize-handle')!.style.left,
      viewerW: vr.width,
      viewerL: vr.left,
      viewerR: vr.right,
      viewerStyleW: viewer.style.width,
      viewerComputedFlex: (window as any).getComputedStyle(viewer).flex,
    };
  });
  console.log('\nAfter RIGHT:', JSON.stringify(afterRight, null, 2));
});
