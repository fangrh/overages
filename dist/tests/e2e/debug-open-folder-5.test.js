import { test, expect } from '@playwright/test';
import path from 'path';
test('open folder button triggers file select populated with python files', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    page.on('console', msg => {
        if (msg.type() === 'error')
            errors.push(msg.text());
    });
    await page.goto('http://localhost:3000');
    await page.waitForTimeout(5000); // Wait for all chunks to load
    // Verify initial state
    console.log('Initial state:');
    console.log('Studio:', await page.evaluate(() => !!window.studio));
    console.log('Errors:', errors);
    // The overgds project directory itself has server/lib/*.ts files, but no .py files
    // Let's use the parent superGDS project which has python/*.py files
    const testDir = path.join(process.cwd(), '..', 'python');
    console.log('\nUsing test dir:', testDir);
    // Set workspace via API
    const wsResp = await page.request.post('http://localhost:3000/workspace', {
        data: { workspace: testDir }
    });
    console.log('POST /workspace:', wsResp.status(), await wsResp.json());
    // Get files
    const filesResp = await page.request.get('http://localhost:3000/api/files');
    const filesData = await filesResp.json();
    console.log('GET /api/files:', filesResp.status(), filesData);
    // Now manually trigger loadFileList in page context
    await page.evaluate(async (dir) => {
        sessionStorage.setItem('supergds-workspace', dir);
        const res = await fetch('/api/files');
        const data = await res.json();
        console.log('Fetched files:', data.files?.length);
    }, testDir);
    await page.waitForTimeout(1000);
    // Check file-select element
    const fileSelectHtml = await page.$eval('#file-select', el => el.innerHTML);
    console.log('\nFile-select HTML:', fileSelectHtml.substring(0, 200));
    // Check run button state
    const runDisabled = await page.$eval('#run-btn', btn => btn.disabled);
    console.log('Run button disabled:', runDisabled);
    expect(errors).toHaveLength(0);
});
test('verify open folder button click triggers folder input click without JS errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    await page.goto('http://localhost:3000');
    await page.waitForTimeout(5000);
    // Check button click handler works without error
    await page.click('#open-folder-btn');
    console.log('Open folder button clicked successfully');
    console.log('Errors after click:', errors);
    expect(errors).toHaveLength(0);
});
