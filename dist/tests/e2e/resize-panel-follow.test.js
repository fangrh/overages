import { test, expect } from '@playwright/test';
/**
 * D5: Find where in the drag lifecycle the panel widths get reset.
 * Phase 2: Find pattern — check if mouseup fires before/after layout commit.
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
            viewerRectLeft: viewer.getBoundingClientRect().left,
        };
    });
}
test.describe('Resize Handle Panel Following', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('http://localhost:3000');
        await page.waitForLoadState('networkidle');
        const panels = await page.evaluate(() => document.getElementById('panels')?.className ?? '');
        if (panels.includes('editor')) {
            await page.keyboard.press('Control+\\');
            await page.waitForTimeout(200);
        }
    });
    test('D5: Track panel widths through mouseup sequence', async ({ page }) => {
        const center = await getHandleCenter(page);
        expect(center).not.toBeNull();
        const before = await getState(page);
        console.log('[1] BEFORE:', JSON.stringify(before));
        const targetX = center.x + 150;
        await page.mouse.move(center.x, center.y);
        await page.mouse.down();
        // Move in small increments to track the drag
        for (let i = 1; i <= 5; i++) {
            const stepX = center.x + (targetX - center.x) * (i / 5);
            await page.mouse.move(stepX, center.y);
            await page.waitForTimeout(50);
            const mid = await getState(page);
            console.log(`[drag step ${i}]: editor.style.width=${mid.editorStyleWidth}, handle.style.left=${mid.handleStyleLeft}, editor.rect.width=${mid.editorRectWidth.toFixed(0)}`);
        }
        // Now capture just before mouseup
        const preMouseup = await getState(page);
        console.log('[2] PRE-MOUSEUP:', JSON.stringify(preMouseup));
        // Mouseup
        await page.mouse.up();
        await page.waitForTimeout(50);
        const postMouseup = await getState(page);
        console.log('[3] POST-MOUSEUP (50ms):', JSON.stringify(postMouseup));
        await page.waitForTimeout(200);
        const postMouseup200 = await getState(page);
        console.log('[4] POST-MOUSEUP (200ms):', JSON.stringify(postMouseup200));
        // Key question: does editor.rect.width match handle.style.left after mouseup?
        const handleLeftNum = parseFloat(postMouseup.handleStyleLeft || '0');
        const editorRectNum = postMouseup.editorRectWidth;
        console.log(`\n=== ANALYSIS ===`);
        console.log(`handle.style.left = ${handleLeftNum}px`);
        console.log(`editor.getBoundingClientRect().width = ${editorRectNum.toFixed(1)}px`);
        console.log(`MATCH? ${Math.abs(handleLeftNum - editorRectNum) < 5 ? 'YES' : 'NO (gap: ' + (handleLeftNum - editorRectNum).toFixed(1) + 'px)'}`);
        // The panels DID follow during drag (editor.style.width = handle.style.left = 641px)
        // But after mouseup: editor.rect.width = ~490, handle.style.left = 641
        // This means the panels RESET to equal split but handle stayed at dragged position
    });
    test('D6: Does setting editor width and NOT clearing it on mouseup keep panels fixed?', async ({ page }) => {
        // This tests if the problem is the style clearing on mouseup
        const center = await getHandleCenter(page);
        expect(center).not.toBeNull();
        await page.mouse.move(center.x, center.y);
        await page.mouse.down();
        await page.mouse.move(center.x + 150, center.y, { steps: 10 });
        // DON'T mouseup yet — check state mid-drag
        const midDrag = await getState(page);
        console.log('[MID-DRAG no mouseup]:', JSON.stringify(midDrag));
        console.log(`editor.rect.width=${midDrag.editorRectWidth.toFixed(0)} vs style.width=${midDrag.editorStyleWidth}`);
        // Panels DID follow during drag
        expect(parseFloat(midDrag.editorStyleWidth)).toBeGreaterThan(500);
        expect(midDrag.handleStyleLeft).toBe(midDrag.editorStyleWidth);
        await page.mouse.up();
        await page.waitForTimeout(200);
    });
});
