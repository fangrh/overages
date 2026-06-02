import { test, expect, Page } from '@playwright/test';

/**
 * Diagnostic test: observes what happens to each element during drag.
 * Phase 1: Gather evidence, don't guess.
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
  await page.waitForTimeout(200);
}

async function getEditorPaneRect(page: Page) {
  return page.evaluate(() => {
    const e = document.getElementById('editor-pane');
    if (!e) return null;
    const r = e.getBoundingClientRect();
    return { left: r.left, right: r.right, width: r.width, styleWidth: e.style.width, styleFlex: e.style.flex };
  });
}

async function getViewerPaneRect(page: Page) {
  return page.evaluate(() => {
    const v = document.getElementById('viewer-pane');
    if (!v) return null;
    const r = v.getBoundingClientRect();
    return { left: r.left, right: r.right, width: r.width, styleWidth: v.style.width, styleFlex: v.style.flex };
  });
}

async function getHandleRect(page: Page) {
  return page.evaluate(() => {
    const h = document.getElementById('resize-handle');
    if (!h) return null;
    const r = h.getBoundingClientRect();
    return { left: r.left, right: r.right, width: r.width, styleLeft: h.style.left };
  });
}

async function getComputedWidths(page: Page) {
  return page.evaluate(() => {
    const editor = document.getElementById('editor-pane')!;
    const viewer = document.getElementById('viewer-pane')!;
    const handle = document.getElementById('resize-handle')!;
    const csEditor = window.getComputedStyle(editor);
    const csViewer = window.getComputedStyle(viewer);
    return {
      editorWidth: csEditor.width,
      editorFlex: csEditor.flex,
      editorDisplay: csEditor.display,
      viewerWidth: csViewer.width,
      viewerFlex: csViewer.flex,
      handleLeft: handle.style.left,
      panelsWidth: document.getElementById('panels')?.getBoundingClientRect().width
    };
  });
}

test.describe('Resize Handle Diagnostic', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');
    // Ensure split mode
    const panels = await page.evaluate(() => document.getElementById('panels')?.className ?? '');
    if (panels.includes('editor')) {
      await page.keyboard.press('Control+\\');
      await page.waitForTimeout(200);
    }
  });

  test('D1: observe element dimensions before drag', async ({ page }) => {
    const before = await getComputedWidths(page);
    console.log('BEFORE drag:', JSON.stringify(before, null, 2));

    const editorRect = await getEditorPaneRect(page);
    const viewerRect = await getViewerPaneRect(page);
    const handleRect = await getHandleRect(page);

    console.log('editor-pane:', JSON.stringify(editorRect, null, 2));
    console.log('viewer-pane:', JSON.stringify(viewerRect, null, 2));
    console.log('resize-handle:', JSON.stringify(handleRect, null, 2));

    // Sanity: handle left should match editor right
    expect(handleRect!.left).toBeCloseTo(editorRect!.right, 5);
  });

  test('D2: observe element dimensions during and after drag right +100px', async ({ page }) => {
    const before = await getComputedWidths(page);
    console.log('BEFORE:', JSON.stringify(before, null, 2));

    await dragHandleBy(page, 100);

    const after = await getComputedWidths(page);
    console.log('AFTER drag +100px:', JSON.stringify(after, null, 2));

    const editorRect = await getEditorPaneRect(page);
    const viewerRect = await getViewerPaneRect(page);
    const handleRect = await getHandleRect(page);

    console.log('editor-pane after:', JSON.stringify(editorRect, null, 2));
    console.log('viewer-pane after:', JSON.stringify(viewerRect, null, 2));
    console.log('resize-handle after:', JSON.stringify(handleRect, null, 2));

    // What changed?
    const editorWidthBefore = parseFloat(before.editorWidth);
    const editorWidthAfter = parseFloat(after.editorWidth);
    console.log(`Editor width: ${editorWidthBefore} -> ${editorWidthAfter} (delta ${editorWidthAfter - editorWidthBefore})`);

    // Check handle left matches editor width
    const handleLeftAfter = parseFloat(after.handleLeft);
    console.log(`Handle style.left: ${handleLeftAfter}, Editor computed width: ${editorWidthAfter}`);

    // Check viewer width
    const viewerWidthBefore = parseFloat(before.viewerWidth);
    const viewerWidthAfter = parseFloat(after.viewerWidth);
    console.log(`Viewer width: ${viewerWidthBefore} -> ${viewerWidthAfter} (delta ${viewerWidthAfter - viewerWidthBefore})`);
  });
});