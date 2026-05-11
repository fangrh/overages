import { test, expect } from '@playwright/test';
import path from 'path';

test('open folder flow - API integration test', async ({ page }) => {
  const errors: string[] = [];
  const consoleLogs: string[] = [];

  page.on('pageerror', err => errors.push(`PAGE ERROR: ${err.message}`));
  page.on('console', msg => {
    consoleLogs.push(`${msg.type()}: ${msg.text()}`);
    if (msg.type() === 'error') {
      errors.push(`CONSOLE ERROR: ${msg.text()}`);
    }
  });

  await page.goto('http://localhost:3000');
  await page.waitForTimeout(3000);

  console.log('=== Before folder open ===');
  console.log('Studio:', await page.evaluate(() => !!(window as any).studio));
  console.log('Monaco:', await page.evaluate(() => !!(window as any).monaco));
  console.log('File select value:', await page.$eval('#file-select', el => (el as HTMLSelectElement).value));
  console.log('Errors:', errors);

  // Test 1: API directly - set workspace
  const testDir = path.join(process.cwd(), '..', 'superGDS', 'lib');
  console.log('\n=== Test 1: Direct API calls ===');
  console.log('Workspace path:', testDir);

  const wsResp = await page.request.post('http://localhost:3000/workspace', {
    data: { workspace: testDir }
  });
  console.log('POST /workspace:', wsResp.status(), await wsResp.json());

  const filesResp = await page.request.get('http://localhost:3000/api/files');
  console.log('GET /api/files:', filesResp.status());
  const filesData = await filesResp.json();
  console.log('Files count:', filesData.files?.length);
  console.log('Python files:', filesData.files?.filter((f: string) => f.endsWith('.py')));

  // Test 2: Now reload and check if sessionStorage restores state
  console.log('\n=== Test 2: After reload ===');

  // Set sessionStorage before reload to simulate folder opened
  await page.evaluate((wsPath) => {
    sessionStorage.setItem('supergds-workspace', wsPath);
  }, testDir);

  // Check init code path - sessionStorage set, but page not reloaded yet
  // The init() runs on page load and checks sessionStorage
  // But after reload, Monaco must be loaded first before studio.js runs

  // Get current file-select state
  const beforeReloadSelect = await page.$eval('#file-select', el => el.innerHTML);
  console.log('Before reload file-select:', beforeReloadSelect);

  await page.reload();
  await page.waitForTimeout(5000); // Wait for Monaco to load fully

  console.log('After reload:');
  console.log('Monaco:', await page.evaluate(() => !!(window as any).monaco));
  console.log('Studio:', await page.evaluate(() => !!(window as any).studio));
  console.log('Errors:', errors);
  const afterReloadSelect = await page.$eval('#file-select', el => el.innerHTML);
  console.log('After reload file-select:', afterReloadSelect);

  // Test 3: Call loadFileList directly from console
  console.log('\n=== Test 3: Manual loadFileList ===');
  const result = await page.evaluate(async () => {
    const response = await fetch('/api/files');
    const data = await response.json();
    return data;
  });
  console.log('Direct fetch result:', result.files?.length, 'files');

  expect(errors).toHaveLength(0);
});