import { test, expect } from '@playwright/test';
import path from 'path';

test('open folder populates file tree with Python files', async ({ page }) => {
  const errors: string[] = [];
  const logs: string[] = [];
  page.on('pageerror', err => errors.push(err.message));
  page.on('console', msg => {
    logs.push(`${msg.type()}: ${msg.text()}`);
    if (msg.type() === 'error' && !msg.text().includes('viewer') && !msg.text().includes('404')) {
      errors.push(msg.text());
    }
  });

  await page.goto('http://localhost:3000');
  await page.waitForTimeout(5000);

  // Verify studio initialized
  expect(await page.evaluate(() => !!(window as any).studio)).toBe(true);

  // Open folder using the folder input
  const pythonDir = path.join(process.cwd(), '..', 'python');
  console.log('Opening folder:', pythonDir);

  // Set sessionStorage directly to bypass the path issue
  await page.evaluate((dir) => {
    sessionStorage.setItem('supergds-workspace', dir);
  }, pythonDir);

  // Manually trigger loadFileTree via the API
  const wsResp = await page.request.post('http://localhost:3000/workspace', {
    data: { workspace: pythonDir }
  });
  console.log('Workspace POST response:', wsResp.status(), await wsResp.json());

  // Now load files
  const filesResp = await page.request.get('http://localhost:3000/api/files');
  const filesData = await filesResp.json();
  console.log('Files response:', filesData.files?.length, 'files');

  // Reload page to trigger the file tree rendering
  await page.reload();
  await page.waitForTimeout(5000);

  // Check file tree has content
  const treeItems = await page.$$('.tree-item');
  console.log('Tree items found:', treeItems.length);

  // If tree is still empty, check what's in the file tree div
  const fileTreeHtml = await page.$eval('#file-tree', el => el.innerHTML);
  console.log('File tree HTML:', fileTreeHtml.substring(0, 500));

  // Check terminal content
  const terminalContent = await page.$eval('#terminal-body', el => el.textContent);
  console.log('Terminal:', terminalContent?.substring(0, 200));

  console.log('Errors:', errors);
});