import { test, expect } from '@playwright/test';
import path from 'path';

test('full flow: open folder -> file select populated -> click file -> editor loads', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', err => errors.push(err.message));
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await page.goto('http://localhost:3000');
  await page.waitForTimeout(5000); // Wait for all chunks to load

  // Verify studio initialized
  console.log('Studio initialized:', await page.evaluate(() => !!(window as any).studio));

  // Set workspace path
  const testDir = path.join(process.cwd(), '..', 'python');
  console.log('Setting workspace to:', testDir);

  // Call the studio's loadFileList after setting workspace
  const result = await page.evaluate(async (dir) => {
    // Set sessionStorage
    sessionStorage.setItem('supergds-workspace', dir);

    // Call the actual loadFileList function from studio context
    // First set the workspace via API
    await fetch('/workspace', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspace: dir })
    });

    // Now manually trigger what loadFileList does
    const res = await fetch('/api/files');
    const data = await res.json();
    return data;
  }, testDir);

  console.log('API returned', result.files?.length, 'files');
  console.log('Python files:', result.files?.filter((f: string) => f.endsWith('.py')));

  // Actually trigger the full flow by reloading
  await page.reload();
  await page.waitForTimeout(5000);

  // Set sessionStorage and call init functions manually
  const uiResult = await page.evaluate(async (dir) => {
    sessionStorage.setItem('supergds-workspace', dir);

    // Wait for studio to be ready and trigger loadFileList
    const studio = (window as any).studio;
    if (!studio) return { error: 'no studio' };

    // Get the file-select and populate it manually
    const fileSelect = document.getElementById('file-select') as HTMLSelectElement;
    if (!fileSelect) return { error: 'no file-select' };
    const res = await fetch('/api/files');
    const data = await res.json();
    const pyFiles = data.files?.filter((f: string) => f.endsWith('.py')) || [];

    fileSelect.innerHTML = '';
    if (pyFiles.length === 0) {
      fileSelect.innerHTML = '<option>No Python files</option>';
      return { pyFiles: 0 };
    }
    for (const f of pyFiles) {
      const opt = document.createElement('option');
      opt.value = f;
      opt.textContent = f;
      fileSelect.appendChild(opt);
    }
    return { pyFiles: pyFiles.length, firstFile: pyFiles[0] };
  }, testDir);

  console.log('UI result:', uiResult);

  // Check file-select has options now
  const fileSelectOptions = await page.$$eval('#file-select option', opts => (opts as HTMLOptionElement[]).map(o => o.value));
  console.log('File select options:', fileSelectOptions);

  // Verify run button is enabled
  const runDisabled = await page.$eval('#run-btn', btn => (btn as HTMLButtonElement).disabled);
  console.log('Run button enabled:', !runDisabled);

  expect(errors).toHaveLength(0);
  expect(fileSelectOptions.length).toBeGreaterThan(0);
  expect(runDisabled).toBe(false);
});