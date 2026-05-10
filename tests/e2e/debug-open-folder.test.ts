import { test, expect } from '@playwright/test';

test('verify no JS errors on page load and button click', async ({ page }) => {
  const errors: string[] = [];
  const consoleMessages: string[] = [];

  page.on('pageerror', err => errors.push(`PAGE ERROR: ${err.message}`));
  page.on('console', msg => {
    if (msg.type() === 'error') {
      errors.push(`CONSOLE ERROR: ${msg.text()}`);
    } else {
      consoleMessages.push(`${msg.type()}: ${msg.text()}`);
    }
  });

  await page.goto('http://localhost:3000');
  await page.waitForTimeout(2000); // Wait for Monaco to load

  console.log('Errors after page load:', errors);
  console.log('Console messages:', consoleMessages.slice(0, 10));

  // Now click the button
  await page.click('#open-folder-btn');
  await page.waitForTimeout(1000);

  console.log('Errors after button click:', errors);

  // If there are no errors, the click worked
  expect(errors).toHaveLength(0);
});

test('studio.js is loading without errors', async ({ page }) => {
  await page.goto('http://localhost:3000');

  const jsErrors: string[] = [];
  page.on('pageerror', err => jsErrors.push(err.message));

  await page.waitForTimeout(3000); // Let scripts load

  // Check if Monaco editor initialized
  const monacoLoaded = await page.evaluate(() => {
    return !!(window as any).monaco;
  });

  // Check if studio global is set
  const studioExists = await page.evaluate(() => {
    return !!(window as any).studio;
  });

  console.log('Monaco loaded:', monacoLoaded);
  console.log('Studio exists:', studioExists);
  console.log('JS errors:', jsErrors);

  expect(jsErrors).toHaveLength(0);
});
