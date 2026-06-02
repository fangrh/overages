import { test } from '@playwright/test';
// Check CSS style property (not computed rect) during right drag
test('QA: RIGHT drag — check style.width vs computed rect', async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');
    // LEFT drag first to lock panes
    let center = await page.evaluate(() => {
        const h = document.getElementById('resize-handle');
        const r = h.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    await page.mouse.move(center.x, center.y);
    await page.mouse.down();
    for (let i = 1; i <= 5; i++) {
        await page.mouse.move(center.x - i * 20, center.y, { steps: 3 });
        await page.waitForTimeout(20);
    }
    await page.mouse.up();
    await page.waitForTimeout(300);
    console.log('After LEFT drag - style.widths:', await page.evaluate(() => ({
        editor: document.getElementById('editor-pane').style.width,
        viewer: document.getElementById('viewer-pane').style.width,
        handle: document.getElementById('resize-handle').style.left,
    })));
    // RIGHT drag
    center = await page.evaluate(() => {
        const h = document.getElementById('resize-handle');
        const r = h.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    await page.mouse.move(center.x, center.y);
    await page.mouse.down();
    await page.waitForTimeout(50);
    console.log('\nDuring RIGHT drag:');
    for (let step = 1; step <= 5; step++) {
        await page.mouse.move(center.x + step * 20, center.y, { steps: 3 });
        await page.waitForTimeout(50);
        const s = await page.evaluate(() => {
            const editor = document.getElementById('editor-pane');
            const viewer = document.getElementById('viewer-pane');
            const handle = document.getElementById('resize-handle');
            const panels = document.getElementById('panels');
            // Force layout flush by reading computed style
            const viewerComputed = window.getComputedStyle(viewer);
            return {
                // Inline styles (what we set)
                editorStyleWidth: editor.style.width,
                viewerStyleWidth: viewer.style.width,
                handleStyleLeft: handle.style.left,
                // Computed values
                editorComputedW: editor.getBoundingClientRect().width,
                viewerComputedW: viewer.getBoundingClientRect().width,
                viewerComputedFlex: viewerComputed.flex,
                // Geometry
                panelsW: panels.getBoundingClientRect().width,
                totalInline: (parseFloat(editor.style.width) || 0) + 5 + (parseFloat(viewer.style.width) || 0),
                totalComputed: editor.getBoundingClientRect().width + 5 + viewer.getBoundingClientRect().width,
            };
        });
        console.log(`+${step * 20}px: inline[editor=${s.editorStyleWidth} viewer=${s.viewerStyleWidth}] computed[editor=${s.editorComputedW} viewer=${s.viewerComputedW}] computedFlex=${s.viewerComputedFlex} totalInline=${s.totalInline} totalComputed=${s.totalComputed} panels=${s.panelsW}`);
    }
    await page.mouse.up();
    await page.waitForTimeout(300);
    const after = await page.evaluate(() => ({
        editorStyleWidth: document.getElementById('editor-pane').style.width,
        viewerStyleWidth: document.getElementById('viewer-pane').style.width,
        editorComputedW: document.getElementById('editor-pane').getBoundingClientRect().width,
        viewerComputedW: document.getElementById('viewer-pane').getBoundingClientRect().width,
    }));
    console.log('\nAfter RIGHT release:', after);
});
