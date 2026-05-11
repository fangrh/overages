import { test, expect, Page } from '@playwright/test';

/**
 * F1: After drag right, editor visual width should increase proportionally to handle position.
 * F2: Editor visual width should match handle.style.left after mouseup.
 * F3: Viewer visual left should equal handle visual right (they touch, no gap).
 */

async function getHandleCenter(page: Page) {
  return page.evaluate(() => {
    const handle = document.getElementById('resize-handle');
    if (!handle) return null;
    const rect = handle.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  });
}

async function dragHandleBy(page: Page, deltaX: number) {
  const center = await getHandleCenter(page);
  if (!center) throw new Error('Handle not found');
  const targetX = center.x + deltaX;
  await page.mouse.move(center.x, center.y);
  await page.mouse.down();
  await page.mouse.move(targetX, center.y, { steps: 20 });
  await page.mouse.up();
  await page.waitForTimeout(300);
}

async function getFullState(page: Page) {
  return page.evaluate(() => {
    const editor = document.getElementById('editor-pane');
    const viewer = document.getElementById('viewer-pane');
    const handle = document.getElementById('resize-handle');
    const er = editor?.getBoundingClientRect();
    const vr = viewer?.getBoundingClientRect();
    const hr = handle?.getBoundingClientRect();
    return {
      handleStyleLeft: handle?.style.left,
      editorStyleWidth: editor?.style.width,
      editorRectWidth: er?.width,
      editorRectLeft: er?.left,
      editorRectRight: er?.right,
      viewerRectLeft: vr?.left,
      viewerRectWidth: vr?.width,
      viewerRectRight: vr?.right,
      handleRectLeft: hr?.left,
      handleRectRight: hr?.right,
      handleRectWidth: hr?.width,
    };
  });
}

test.describe('Resize Handle Visual Panel Following', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');
    const current = await page.evaluate(() => document.getElementById('panels')?.className ?? '');
    if (current.includes('editor')) {
      await page.keyboard.press('Control+\\');
      await page.waitForTimeout(200);
    }
  });

  test('F1: after drag right +150px, editor visual width increases', async ({ page }) => {
    const before = await getFullState(page);
    const initialEditorWidth = before.editorRectWidth;
    console.log('Initial editor width:', initialEditorWidth);

    await dragHandleBy(page, 150);

    const after = await getFullState(page);
    console.log('After drag - editor rect width:', after.editorRectWidth);
    console.log('After drag - handle.style.left:', after.handleStyleLeft);

    // Editor visual width should increase
    expect(after.editorRectWidth).toBeGreaterThan((initialEditorWidth ?? 0) + 50);
  });

  test('F2: after drag, handle.style.left equals editor visual width (no gap)', async ({ page }) => {
    await dragHandleBy(page, 150);

    const state = await getFullState(page);
    const handleLeftNum = parseFloat(state.handleStyleLeft || '0');
    const editorWidth = state.editorRectWidth;

    console.log(`handle.style.left = ${handleLeftNum}, editor rect width = ${editorWidth}`);
    console.log(`handle visual left = ${state.handleRectLeft}, editor visual right = ${state.editorRectRight}`);

    // The handle visual position should match the editor visual right
    expect(state.handleRectLeft ?? 0).toBeCloseTo(state.editorRectRight ?? 0, 5);
  });

  test('F3: viewer visual left equals handle visual right (panels touch)', async ({ page }) => {
    await dragHandleBy(page, 150);

    const state = await getFullState(page);

    console.log(`viewer rect left = ${state.viewerRectLeft}, handle rect right = ${state.handleRectRight}`);
    console.log(`gap = viewer_left - handle_right = ${((state.viewerRectLeft ?? 0) - (state.handleRectRight ?? 0)).toFixed(1)}px`);

    // Viewer left should equal handle left (panels touch at handle position)
    expect(state.viewerRectLeft ?? 0).toBeCloseTo(state.handleRectLeft ?? 0, 5);
  });
});