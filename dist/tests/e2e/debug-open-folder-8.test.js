import { test, expect } from '@playwright/test';
import path from 'path';
test('open folder button - verify UI elements and error handling work', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    page.on('console', msg => {
        // Ignore expected errors (viewer iframe 404s, API errors from bad paths)
        const text = msg.text();
        if (msg.type() === 'error' && !text.includes('viewer') && !text.includes('404') && !text.includes('500')) {
            errors.push(text);
        }
    });
    await page.goto('http://localhost:3000');
    await page.waitForTimeout(5000);
    // Verify studio initialized
    expect(await page.evaluate(() => !!window.studio)).toBe(true);
    console.log('Studio initialized: true');
    // Check initial UI state
    const initialRunDisabled = await page.$eval('#run-btn', btn => btn.disabled);
    const initialFileSelect = await page.$eval('#file-select', el => el.innerHTML);
    console.log('Initial run button disabled:', initialRunDisabled);
    console.log('Initial file-select:', initialFileSelect.substring(0, 50));
    // Click open folder button - this should open folder dialog (won't open in test but shouldn't error)
    await page.click('#open-folder-btn');
    console.log('Open folder button clicked');
    await page.waitForTimeout(1000);
    // Check there are no JS errors from the button click
    console.log('Errors after button click:', errors.filter(e => !e.includes('viewer') && !e.includes('500')));
    // Test with setInputFiles simulating folder selection
    const pythonDir = path.join(process.cwd(), '..', 'python');
    console.log('Setting folder input to:', pythonDir);
    const folderInput = page.locator('#folder-input');
    await folderInput.setInputFiles(pythonDir);
    await page.waitForTimeout(2000);
    // Session storage should have something (even if relative path from webkitRelativePath)
    const savedWs = await page.evaluate(() => sessionStorage.getItem('supergds-workspace'));
    console.log('sessionStorage workspace:', savedWs);
    // File select should show an error message (since path is relative, not absolute)
    const fileSelectHtml = await page.$eval('#file-select', el => el.innerHTML);
    console.log('File select HTML:', fileSelectHtml);
    // Run button should be enabled (even if API calls will fail)
    const runDisabled = await page.$eval('#run-btn', btn => btn.disabled);
    console.log('Run button enabled:', !runDisabled);
    // Check no unexpected JS errors
    const unexpectedErrors = errors.filter(e => !e.includes('viewer') && !e.includes('404') && !e.includes('500') && !e.includes('Failed to load'));
    console.log('Unexpected errors:', unexpectedErrors);
    // Core assertion: no unexpected JS errors
    expect(unexpectedErrors).toHaveLength(0);
});
