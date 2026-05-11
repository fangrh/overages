import { test, expect } from '@playwright/test';
import path from 'path';

test('open folder and verify file loading', async ({ page }) => {
  const errors: string[] = [];
  const networkRequests: { url: string; method: string; status: number }[] = [];

  // Capture JS errors
  page.on('pageerror', err => errors.push(`PAGE ERROR: ${err.message}`));
  page.on('console', msg => {
    if (msg.type() === 'error') {
      errors.push(`CONSOLE ERROR: ${msg.text()}`);
    }
  });

  // Capture network requests
  page.on('response', resp => {
    networkRequests.push({ url: resp.url(), method: resp.request().method(), status: resp.status() });
  });

  await page.goto('http://localhost:3000');
  await page.waitForTimeout(3000); // Wait for Monaco to load

  console.log('=== Initial state ===');
  console.log('Errors:', errors);
  console.log('Studio exists:', await page.evaluate(() => !!(window as any).studio));
  console.log('File select value:', await page.$eval('#file-select', el => (el as HTMLSelectElement).value));

  // Open folder dialog programmatically
  console.log('\n=== Clicking Open Folder ===');
  const folderInput = page.locator('#folder-input');
  const openFolderBtn = page.locator('#open-folder-btn');

  // Use a known test directory with Python files
  const testDir = path.join(process.cwd(), '..', 'superGDS', 'lib');
  console.log('Using test directory:', testDir);

  // Set files on the folder input
  await folderInput.setInputFiles('');
  await openFolderBtn.click();

  // Wait a bit then check
  await page.waitForTimeout(1000);

  console.log('\n=== After clicking Open Folder button ===');
  console.log('Folder input element:', await folderInput.count());
  console.log('File select innerHTML:', await page.$eval('#file-select', el => el.innerHTML));
  console.log('Errors:', errors);

  // Try to dispatch change event manually
  await page.evaluate(() => {
    const input = document.getElementById('folder-input') as HTMLInputElement;
    console.log('folder-input files:', input?.files?.length);
    if (input?.files?.length) {
      const dt = new DataTransfer();
      // We can't actually set real files but we can trigger the event
    }
    // Force trigger change for debugging
    const event = new Event('change', { bubbles: true });
    input?.dispatchEvent(event);
  });

  await page.waitForTimeout(2000);

  console.log('\n=== After manual change dispatch ===');
  console.log('File select value:', await page.$eval('#file-select', el => (el as HTMLSelectElement).value));
  console.log('Errors:', errors);

  // Check if sessionStorage has workspace
  const savedWs = await page.evaluate(() => sessionStorage.getItem('supergds-workspace'));
  console.log('sessionStorage workspace:', savedWs);

  // Check server response
  console.log('\n=== Network requests ===');
  networkRequests.forEach(r => console.log(`${r.method} ${r.url} -> ${r.status}`));

  // Now check if we can call the API directly
  console.log('\n=== Testing API directly ===');
  const healthResp = await page.request.get('http://localhost:3000/api/health');
  console.log('Health check:', healthResp.status(), await healthResp.json());

  // Check if workspace was set
  const filesResp = await page.request.get('http://localhost:3000/api/files');
  console.log('Files API status:', filesResp.status());
  const filesBody = await filesResp.json();
  console.log('Files response:', JSON.stringify(filesBody));
});

test('file-select shows correct options after workspace set', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', err => errors.push(err.message));
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await page.goto('http://localhost:3000');
  await page.waitForTimeout(2000);

  // Check initial state
  const initialHtml = await page.$eval('#file-select', el => el.innerHTML);
  console.log('Initial file-select:', initialHtml);

  // Directly POST to workspace API with test dir
  const testDir = path.join(process.cwd(), '..', 'superGDS', 'lib');
  console.log('Setting workspace to:', testDir);

  const wsResp = await page.request.post('http://localhost:3000/api/workspace', {
    data: { workspace: testDir }
  });
  console.log('Workspace POST response:', wsResp.status(), await wsResp.json());

  // Now fetch files
  const filesResp = await page.request.get('http://localhost:3000/api/files');
  console.log('Files GET response:', filesResp.status(), await filesResp.json());

  // Reload page and check if file select is populated
  await page.reload();
  await page.waitForTimeout(3000);

  const newHtml = await page.$eval('#file-select', el => el.innerHTML);
  console.log('After reload, file-select:', newHtml);

  expect(errors).toHaveLength(0);
});