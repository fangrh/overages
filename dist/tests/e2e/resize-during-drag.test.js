import { test, expect } from '@playwright/test';
/**
 * D3: Test that editor-pane inline width matches handle style.left DURING drag.
 * Phase 1: Gather evidence — check what happens mid-drag.
 */
async function getHandleCenter(page) {
    return page.evaluate(() => {
        const handle = document.getElementById('resize-handle');
        if (!handle)
            return null;
        const rect = handle.getBoundingClientRect();
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    });
}
// Drag and STOP mid-drag (no mouseup) — capture state
async function dragAndHold(page, targetX, startX, y) {
    await page.mouse.move(startX, y);
    await page.mouse.down();
    await page.mouse.move(targetX, y, { steps: 10 });
    // Don't mouseup — hold mid-drag
}
async function getMidDragState(page) {
    return page.evaluate(() => {
        const editor = document.getElementById('editor-pane');
        const handle = document.getElementById('resize-handle');
        const viewer = document.getElementById('viewer-pane');
        return {
            editorStyleWidth: editor.style.width,
            editorStyleFlex: editor.style.flex,
            editorRectWidth: editor.getBoundingClientRect().width,
            handleStyleLeft: handle.style.left,
            handleRectLeft: handle.getBoundingClientRect().left,
            viewerRectWidth: viewer.getBoundingClientRect().width,
            handleClass: handle.className
        };
    });
}
test.describe('Resize Handle Mid-Drag State', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('http://localhost:3000');
        await page.waitForLoadState('networkidle');
        const panels = await page.evaluate(() => document.getElementById('panels')?.className ?? '');
        if (panels.includes('editor')) {
            await page.keyboard.press('Control+\\');
            await page.waitForTimeout(200);
        }
    });
    test('D3: during drag, editor inline width should match handle style.left', async ({ page }) => {
        const center = await getHandleCenter(page);
        expect(center).not.toBeNull();
        const targetX = center.x + 100;
        // Start drag
        await page.mouse.move(center.x, center.y);
        await page.mouse.down();
        // Move partway (10 steps), then capture mid-drag state
        await page.mouse.move(targetX, center.y, { steps: 10 });
        // While still holding (no mouseup yet), check state
        const midState = await getMidDragState(page);
        console.log('MID-DRAG state:', JSON.stringify(midState, null, 2));
        // The key assertion: editor's inline width should equal handle's inline left
        const editorWidth = parseFloat(midState.editorStyleWidth || '0');
        const handleLeft = parseFloat(midState.handleStyleLeft || '0');
        console.log(`editor.style.width = ${midState.editorStyleWidth} (${editorWidth}), handle.style.left = ${midState.handleStyleLeft} (${handleLeft})`);
        // Release drag
        await page.mouse.up();
        await page.waitForTimeout(200);
        const afterState = await getMidDragState(page);
        console.log('AFTER drag state:', JSON.stringify(afterState, null, 2));
        // The mismatch between handle.style.left and editor.style.width during drag is the bug
        // handle.style.left should equal editor.style.width if they're linked
        expect(midState.editorStyleWidth).toBeTruthy();
        expect(midState.handleStyleLeft).toBeTruthy();
        const editorWidthNum = parseFloat(midState.editorStyleWidth);
        const handleLeftNum = parseFloat(midState.handleStyleLeft);
        expect(handleLeftNum).toBeCloseTo(editorWidthNum, 1);
    });
    test('D4: after mouseup, handle left should stay at dragged position', async ({ page }) => {
        const center = await getHandleCenter(page);
        expect(center).not.toBeNull();
        const beforeState = await getMidDragState(page);
        console.log('BEFORE drag:', JSON.stringify(beforeState, null, 2));
        // Full drag + mouseup
        const targetX = center.x + 100;
        await page.mouse.move(center.x, center.y);
        await page.mouse.down();
        await page.mouse.move(targetX, center.y, { steps: 10 });
        await page.mouse.up();
        await page.waitForTimeout(200);
        const afterState = await getMidDragState(page);
        console.log('AFTER mouseup:', JSON.stringify(afterState, null, 2));
        // Handle style.left should reflect dragged position
        // Before was 491, after drag it should be ~591
        const beforeLeft = parseFloat(beforeState.handleStyleLeft || '0');
        const afterLeft = parseFloat(afterState.handleStyleLeft || '0');
        console.log(`handle.style.left: ${beforeLeft} -> ${afterLeft}`);
        expect(afterLeft).toBeGreaterThan(beforeLeft + 50);
    });
});
