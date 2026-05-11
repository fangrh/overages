import { test } from '@playwright/test';
import path from 'path';
test('check handleFolderOpen is being called and what path it receives', async ({ page }) => {
    const errors = [];
    const logs = [];
    page.on('pageerror', err => errors.push(err.message));
    page.on('console', msg => {
        logs.push(`${msg.type()}: ${msg.text()}`);
    });
    await page.goto('http://localhost:3000');
    await page.waitForTimeout(5000);
    // Inject debugging to see what's happening in handleFolderOpen
    await page.evaluate(() => {
        // Hook into the folder input change handler
        const input = document.getElementById('folder-input');
        console.log('Folder input element:', input);
        input.addEventListener('change', (e) => {
            const files = e.target.files;
            console.log('Files length:', files?.length);
            if (files && files.length > 0) {
                const f = files[0];
                console.log('File name:', f.name);
                console.log('File path:', f.path);
                console.log('webkitRelativePath:', f.webkitRelativePath);
            }
        });
    });
    const pythonDir = path.join(process.cwd(), '..', 'python');
    console.log('Opening folder:', pythonDir);
    const folderInput = page.locator('#folder-input');
    await folderInput.setInputFiles(pythonDir);
    await page.waitForTimeout(2000);
    // Check if sessionStorage was set
    const savedWs = await page.evaluate(() => sessionStorage.getItem('supergds-workspace'));
    console.log('sessionStorage workspace:', savedWs);
    // Check file tree
    const treeItems = await page.$$('.tree-item');
    console.log('Tree items:', treeItems.length);
    console.log('All logs:', logs);
});
