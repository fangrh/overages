import { test, expect } from '@playwright/test';
/**
 * D7: Try clicking the handle FIRST then dragging — like the main test does.
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
async function getState(page) {
    return page.evaluate(() => {
        const editor = document.getElementById('editor-pane');
        const handle = document.getElementById('resize-handle');
        const viewer = document.getElementById('viewer-pane');
        return {
            editorRectWidth: editor.getBoundingClientRect().width,
            editorStyleWidth: editor.style.width,
            editorStyleFlex: editor.style.flex,
            handleStyleLeft: handle.style.left,
            handleRectLeft: handle.getBoundingClientRect().left,
            viewerRectWidth: viewer.getBoundingClientRect().width,
        };
    });
}
test.describe('Resize Handle Click-First Then Drag', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('http://localhost:3000');
        await page.waitForLoadState('networkidle');
        const panels = await page.evaluate(() => document.getElementById('panels')?.className ?? '');
        if (panels.includes('editor')) {
            await page.keyboard.press('Control+\\');
            await page.waitForTimeout(200);
        }
    });
    test('D7: click handle first, then drag (like resize-handle.test.ts)', async ({ page }) => {
        const center = await getHandleCenter(page);
        expect(center).not.toBeNull();
        console.log('Handle center:', center);
        const before = await getState(page);
        console.log('[1] BEFORE:', JSON.stringify(before));
        // Exactly like resize-handle.test.ts dragHandleBy
        const targetX = center.x + 150;
        await page.mouse.move(center.x, center.y);
        await page.waitForTimeout(50);
        await page.mouse.down();
        await page.waitForTimeout(50);
        await page.mouse.move(targetX, center.y, { steps: 20 });
        await page.waitForTimeout(50);
        await page.mouse.up();
        await page.waitForTimeout(200);
        const after = await getState(page);
        console.log('[2] AFTER:', JSON.stringify(after));
        console.log(`handle.style.left: ${before.handleStyleLeft} -> ${after.handleStyleLeft}`);
        console.log(`editor.rect.width: ${before.editorRectWidth} -> ${after.editorRectWidth}`);
        console.log(`viewer.rect.width: ${before.viewerRectWidth} -> ${after.viewerRectWidth}`);
        // This should match R4: dragging right increases handle position
        const handleBefore = parseFloat(before.handleStyleLeft);
        const handleAfter = parseFloat(after.handleStyleLeft);
        expect(handleAfter).toBeGreaterThan(handleBefore + 50);
    });
    test('D8: same as D7 but with explicit click on handle first', async ({ page }) => {
        const center = await getHandleCenter(page);
        expect(center).not.toBeNull();
        const before = await getState(page);
        console.log('[1] BEFORE:', JSON.stringify(before));
        // Explicitly click on the handle first
        await page.click('#resize-handle', { force: true });
        await page.waitForTimeout(100);
        const afterClick = await getState(page);
        console.log('[2] AFTER click:', JSON.stringify(afterClick));
        // Now drag
        const targetX = center.x + 150;
        await page.mouse.move(center.x, center.y);
        await page.mouse.down();
        await page.mouse.move(targetX, center.y, { steps: 20 });
        await page.mouse.up();
        await page.waitForTimeout(200);
        const afterDrag = await getState(page);
        console.log('[3] AFTER drag:', JSON.stringify(afterDrag));
        console.log(`handle.style.left: ${before.handleStyleLeft} -> ${afterDrag.handleStyleLeft}`);
        console.log(`editor.rect.width: ${before.editorRectWidth} -> ${afterDrag.editorRectWidth}`);
    });
});
