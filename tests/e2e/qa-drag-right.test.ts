import { test, expect, Page } from '@playwright/test';

// Diagnostic: drag RIGHT — observe what happens to editorRect, handleLeft, viewerRect at each step
async function getState(page: Page) {
  return page.evaluate(() => {
    const handle = document.getElementById('resize-handle');
    const editor = document.getElementById('editor-pane');
    const viewer = document.getElementById('viewer-pane');
    const panels = document.getElementById('panels');
    return {
      editorRectW: editor?.getBoundingClientRect().width,
      editorStyleWidth: editor?.style.width,
      handleLeft: handle?.style.left,
      handleClass: handle?.className,
      viewerRectW: viewer?.getBoundingClientRect().width,
      viewerStyleWidth: viewer?.style.width,
      panelsClass: panels?.className,
      noTransition: panels?.classList.contains('no-transition'),
      isDragging: handle?.classList.contains('dragging'),
    };
  });
}

test('QA: drag RIGHT - observe each step', async ({ page }) => {
  await page.goto('http://localhost:3000');
  await page.waitForLoadState('networkidle');

  const initial = await getState(page);
  console.log('INITIAL:', initial);

  // Get handle center
  const center = await page.evaluate(() => {
    const h = document.getElementById('resize-handle')!;
    const r = h.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  console.log('Handle center:', center);

  // Mouse down on handle
  await page.mouse.move(center.x, center.y);
  await page.mouse.down();
  await page.waitForTimeout(50);

  let state = await getState(page);
  console.log('AFTER MOUSEDOWN:', state);

  // Drag RIGHT by 100px in steps
  for (let i = 1; i <= 10; i++) {
    const targetX = center.x + i * 10;
    await page.mouse.move(targetX, center.y, { steps: 3 });
    await page.waitForTimeout(30);
    state = await getState(page);
    console.log(`Drag +${i * 10}px: editor=${state.editorRectW}, handleLeft=${state.handleLeft}, noTrans=${state.noTransition}, dragging=${state.isDragging}`);
  }

  // Mouse up
  await page.mouse.up();
  await page.waitForTimeout(100);
  state = await getState(page);
  console.log('AFTER MOUSEUP:', state);

  await page.waitForTimeout(500);
  state = await getState(page);
  console.log('AFTER 500ms:', state);
});
