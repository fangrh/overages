import { test } from '@playwright/test';
test('debug sidebar layout', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    page.on('console', msg => {
        if (msg.type() === 'error') {
            errors.push(msg.text());
        }
    });
    await page.goto('http://localhost:3000');
    await page.waitForTimeout(5000);
    // Get the layout structure
    const bodyHTML = await page.evaluate(() => document.body.innerHTML.substring(0, 2000));
    console.log('Body HTML:', bodyHTML);
    // Check the order and positions of key elements
    const activityBar = await page.$('#activity-bar');
    const sidebar = await page.$('#sidebar');
    const mainContent = await page.$('#main-content');
    console.log('Activity bar exists:', activityBar !== null);
    console.log('Sidebar exists:', sidebar !== null);
    console.log('Main content exists:', mainContent !== null);
    // Get bounding boxes to see positions
    if (activityBar) {
        const box = await activityBar.boundingBox();
        console.log('Activity bar bounding box:', box);
    }
    if (sidebar) {
        const box = await sidebar.boundingBox();
        console.log('Sidebar bounding box:', box);
    }
    if (mainContent) {
        const box = await mainContent.boundingBox();
        console.log('Main content bounding box:', box);
    }
    // Get the layout element
    const layout = await page.$('#layout');
    if (layout) {
        const box = await layout.boundingBox();
        console.log('Layout bounding box:', box);
        const layoutHTML = await layout.innerHTML();
        console.log('Layout children count:', layoutHTML.split('<').length);
    }
    // Check flex direction of body
    const bodyDisplay = await page.evaluate(() => getComputedStyle(document.body).display);
    const bodyFlexDir = await page.evaluate(() => getComputedStyle(document.body).flexDirection);
    console.log('Body display:', bodyDisplay, 'flexDirection:', bodyFlexDir);
    // Check layout display
    const layoutDisplay = await page.evaluate(() => getComputedStyle(document.getElementById('layout')).display);
    const layoutFlexDir = await page.evaluate(() => getComputedStyle(document.getElementById('layout')).flexDirection);
    console.log('Layout display:', layoutDisplay, 'flexDirection:', layoutFlexDir);
    console.log('Errors:', errors);
});
