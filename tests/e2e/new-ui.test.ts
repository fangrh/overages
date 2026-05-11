import { test, expect } from '@playwright/test';

test('new VSCode-like UI loads without errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', err => errors.push(err.message));
  page.on('console', msg => {
    if (msg.type() === 'error' && !msg.text().includes('viewer') && !msg.text().includes('404')) {
      errors.push(msg.text());
    }
  });

  await page.goto('http://localhost:3000');
  await page.waitForTimeout(5000);

  // Check menu bar exists
  const menuBar = await page.$('#menu-bar');
  expect(menuBar).not.toBeNull();

  // Check File menu exists
  const fileMenu = await page.$('#menu-file');
  expect(fileMenu).not.toBeNull();

  // Check sidebar exists
  const sidebar = await page.$('#sidebar');
  expect(sidebar).not.toBeNull();

  // Check file tree exists
  const fileTree = await page.$('#file-tree');
  expect(fileTree).not.toBeNull();

  // Check toolbar with run button exists
  const runBtn = await page.$('#run-btn');
  expect(runBtn).not.toBeNull();

  // Check studio initialized
  expect(await page.evaluate(() => !!(window as any).studio)).toBe(true);

  // Check Monaco editor loaded
  expect(await page.evaluate(() => !!(window as any).monaco)).toBe(true);

  // Check terminal exists
  const terminalBody = await page.$('#terminal-body');
  expect(terminalBody).not.toBeNull();

  // Check current file label exists
  const currentFileLabel = await page.$('#current-file');
  expect(currentFileLabel).not.toBeNull();

  console.log('All UI elements present');
  console.log('Errors:', errors);
  expect(errors).toHaveLength(0);
});