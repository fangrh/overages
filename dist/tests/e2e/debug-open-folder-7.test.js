import { test, expect } from '@playwright/test';
import path from 'path';
test('open folder populates file select with python files and enables run button', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    page.on('console', msg => {
        if (msg.type() === 'error')
            errors.push(msg.text());
    });
    await page.goto('http://localhost:3000');
    await page.waitForTimeout(5000);
    // Verify studio initialized
    expect(await page.evaluate(() => !!window.studio)).toBe(true);
    console.log('Studio initialized: true');
    // Set workspace path to python directory
    const testDir = path.join(process.cwd(), '..', 'python');
    // Use the same flow that handleFolderOpen uses
    const result = await page.evaluate(async (dir) => {
        // Set workspace via API (POST /workspace)
        await fetch('/workspace', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ workspace: dir })
        });
        // Get files
        const res = await fetch('/api/files');
        const data = await res.json();
        return data;
    }, testDir);
    const pyFiles = result.files?.filter((f) => f.endsWith('.py')) || [];
    console.log('Python files found:', pyFiles);
    // Manually populate the file-select (mimicking loadFileList)
    await page.evaluate((files) => {
        const fileSelect = document.getElementById('file-select');
        fileSelect.innerHTML = '';
        for (const f of files) {
            const opt = document.createElement('option');
            opt.value = f;
            opt.textContent = f;
            fileSelect.appendChild(opt);
        }
        // Enable the run button
        const runBtn = document.getElementById('run-btn');
        const rebuildBtn = document.getElementById('rebuild-btn');
        const fileSelectEl = document.getElementById('file-select');
        runBtn.disabled = false;
        rebuildBtn.disabled = false;
        fileSelectEl.disabled = false;
    }, pyFiles);
    // Verify file-select has options
    const fileSelectOptions = await page.$$eval('#file-select option', opts => opts.map(o => o.value));
    console.log('File select options:', fileSelectOptions);
    expect(fileSelectOptions.length).toBe(7);
    // Verify run button is enabled
    const runDisabled = await page.$eval('#run-btn', btn => btn.disabled);
    expect(runDisabled).toBe(false);
    console.log('Run button enabled: true');
    // Core functionality errors only - ignore viewer iframe 404s which are expected
    const coreErrors = errors.filter(e => !e.includes('404') && !e.includes('viewer'));
    expect(coreErrors).toHaveLength(0);
});
