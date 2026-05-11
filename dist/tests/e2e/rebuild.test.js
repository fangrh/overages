import { test, expect } from '@playwright/test';
test.describe('rebuild', () => {
    test('rebuild button is disabled when no workspace open', async ({ page }) => {
        await page.goto('http://localhost:3000');
        const rebuildBtn = page.locator('#rebuild-btn');
        await expect(rebuildBtn).toBeDisabled();
    });
    test('run button is disabled when no workspace open', async ({ page }) => {
        await page.goto('http://localhost:3000');
        const runBtn = page.locator('#run-btn');
        await expect(runBtn).toBeDisabled();
    });
});
