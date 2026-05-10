import { test, expect } from '@playwright/test';

test.describe('annotations', () => {
  test('terminal clear button works', async ({ page }) => {
    await page.goto('http://localhost:3000');

    // Add some terminal output first (via browser console)
    await page.evaluate(() => {
      const terminalBody = document.getElementById('terminal-body')!;
      const line = document.createElement('div');
      line.className = 'stdout';
      line.textContent = 'test output';
      terminalBody.appendChild(line);
    });

    // Click clear
    await page.click('#clear-terminal');

    // Terminal should be empty
    const terminalBody = await page.locator('#terminal-body');
    await expect(terminalBody).toBeEmpty();
  });
});