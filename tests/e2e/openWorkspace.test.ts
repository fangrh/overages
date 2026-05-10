import { test, expect } from '@playwright/test';

test.describe('openWorkspace', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:3000');
  });

  test('page loads and toolbar is visible', async ({ page }) => {
    await expect(page.locator('#toolbar')).toBeVisible();
    await expect(page.locator('#open-folder-btn')).toBeVisible();
    await expect(page.locator('#run-btn')).toBeVisible();
    await expect(page.locator('#rebuild-btn')).toBeVisible();
  });

  test('monaco editor initializes', async ({ page }) => {
    // Wait for Monaco to load
    await page.waitForSelector('#monaco-editor .view-lines', { timeout: 10000 });
    await expect(page.locator('#monaco-editor')).toBeVisible();
  });

  test('terminal panel is visible', async ({ page }) => {
    await expect(page.locator('#terminal')).toBeVisible();
    await expect(page.locator('#terminal-header')).toBeVisible();
  });

  test('gds viewer iframe loads', async ({ page }) => {
    const iframe = page.locator('#gds-viewer');
    await expect(iframe).toBeVisible();
    // Give iframe time to load
    await page.waitForTimeout(2000);
  });
});