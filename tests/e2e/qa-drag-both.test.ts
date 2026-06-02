import { test, expect, Page } from '@playwright/test';

// Check Monaco automaticLayout and pointer events
async function getDeepState(page: Page) {
  return page.evaluate(() => {
    const handle = document.getElementById('resize-handle');
    const editor = document.getElementById('editor-pane');
    const viewer = document.getElementById('viewer-pane');
    const panels = document.getElementById('panels');
    const monaco = document.getElementById('monaco-editor');
    const monacoChild = monaco?.firstElementChild;

    return {
      // Basic geometry
      editorRectW: editor?.getBoundingClientRect().width,
      handleLeft: handle?.style.left,
      handleRect: handle ? handle.getBoundingClientRect() : null,
      viewerRectW: viewer?.getBoundingClientRect().width,
      panelsWidth: panels?.getBoundingClientRect().width,

      // CSS computed
      editorFlex: getComputedStyle(editor!).flex,
      viewerFlex: getComputedStyle(viewer!).flex,
      editorWidth: editor?.style.width,
      viewerWidth: viewer?.style.width,

      // Classes
      handleClass: handle?.className,
      panelsClass: panels?.className,
      noTransition: panels?.classList.contains('no-transition'),
      isDragging: handle?.classList.contains('dragging'),

      // Monaco
      monacoPointerEvents: monacoChild ? getComputedStyle(monacoChild).pointerEvents : null,
      monacoWidth: monaco?.getBoundingClientRect().width,
      editorPaneWidth: editor?.getBoundingClientRect().width,

      // Window resize listener count (rough check)
      handleTop: handle?.getBoundingClientRect().top,
      handleBottom: handle?.getBoundingClientRect().bottom,
    };
  });
}

test('QA: drag LEFT vs RIGHT comparison', async ({ page }) => {
  await page.goto('http://localhost:3000');
  await page.waitForLoadState('networkidle');

  const initial = await getDeepState(page);
  console.log('INITIAL:', JSON.stringify(initial, null, 2));

  const center = await page.evaluate(() => {
    const h = document.getElementById('resize-handle')!;
    const r = h.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });

  // === DRAG LEFT (should work) ===
  console.log('\n--- DRAG LEFT ---');
  await page.mouse.move(center.x, center.y);
  await page.mouse.down();
  await page.waitForTimeout(50);

  for (let i = 1; i <= 5; i++) {
    await page.mouse.move(center.x - i * 20, center.y, { steps: 3 });
    await page.waitForTimeout(20);
  }
  await page.mouse.up();
  await page.waitForTimeout(500);

  const afterLeft = await getDeepState(page);
  console.log('AFTER LEFT:', JSON.stringify(afterLeft, null, 2));

  // === DRAG RIGHT (reported as broken) ===
  console.log('\n--- DRAG RIGHT ---');
  const newCenter = await page.evaluate(() => {
    const h = document.getElementById('resize-handle')!;
    const r = h.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  console.log('New handle center:', newCenter);

  await page.mouse.move(newCenter.x, newCenter.y);
  await page.mouse.down();
  await page.waitForTimeout(50);

  const states: any[] = [];
  for (let i = 1; i <= 5; i++) {
    await page.mouse.move(newCenter.x + i * 20, newCenter.y, { steps: 3 });
    await page.waitForTimeout(20);
    const s = await getDeepState(page);
    states.push({ step: i * 20, ...s });
  }
  console.log('DURING RIGHT DRAG:');
  states.forEach(s => {
    console.log(`  +${s.step}px: editor=${s.editorRectW}, handleLeft=${s.handleLeft}, viewer=${s.viewerRectW}, noTrans=${s.noTransition}`);
  });

  await page.mouse.up();
  await page.waitForTimeout(500);

  const afterRight = await getDeepState(page);
  console.log('AFTER RIGHT:', JSON.stringify(afterRight, null, 2));
});
