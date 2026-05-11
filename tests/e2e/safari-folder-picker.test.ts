import { test, expect } from '@playwright/test';
import path from 'path';

test('check Safari folder input behavior', async ({ page }) => {
  const logs: string[] = [];
  page.on('console', msg => {
    logs.push(`${msg.type()}: ${msg.text()}`);
  });

  await page.goto('http://localhost:3000');
  await page.waitForTimeout(5000);

  // Check if showDirectoryPicker is available
  const hasShowDirPicker = await page.evaluate(() => {
    return typeof (window as any).showDirectoryPicker === 'function';
  });
  console.log('showDirectoryPicker available:', hasShowDirPicker);

  // Check the folder input element
  const folderInputInfo = await page.evaluate(() => {
    const input = document.getElementById('folder-input') as HTMLInputElement;
    return {
      type: input.type,
      webkitdirectory: input.webkitdirectory,
      attributes: {
        type: input.getAttribute('type'),
        webkitdirectory: input.getAttribute('webkitdirectory'),
      },
      id: input.id,
    };
  });
  console.log('Folder input info:', folderInputInfo);

  // Click File menu to open it
  await page.click('#menu-file');
  await page.waitForTimeout(500);

  // Check what the menu looks like
  const menuHTML = await page.$eval('#file-dropdown', el => el.innerHTML);
  console.log('Menu dropdown HTML:', menuHTML);

  // Try to click Open Folder and check if dialog appears
  console.log('Will click Open Folder...');

  // Get current terminal content
  const terminalBefore = await page.$eval('#terminal-body', el => el.textContent);
  console.log('Terminal before:', terminalBefore?.substring(0, 200));

  // Click Open Folder
  await page.click('#menu-open-folder');
  await page.waitForTimeout(2000);

  // Get terminal after
  const terminalAfter = await page.$eval('#terminal-body', el => el.textContent);
  console.log('Terminal after:', terminalAfter?.substring(0, 200));

  console.log('All console logs:', logs);
});