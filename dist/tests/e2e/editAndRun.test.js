import { test, expect } from '@playwright/test';
test.describe('editAndRun', () => {
    test('editor accepts text input', async ({ page }) => {
        await page.goto('http://localhost:3000');
        await page.waitForSelector('#monaco-editor .view-lines', { timeout: 10000 });
        // Click in Monaco editor area
        const editor = page.locator('#monaco-editor');
        await editor.click();
        // Type some Python code
        await page.keyboard.type('import gdsfactory as kf\nprint("hello")');
        // Verify text was entered (Monaco has specific DOM structure)
        const editorContent = await page.locator('#monaco-editor').textContent();
        expect(editorContent).toContain('import gdsfactory');
    });
});
