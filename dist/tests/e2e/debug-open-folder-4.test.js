import { test, expect } from '@playwright/test';
test('check global exports and timing', async ({ page }) => {
    const errors = [];
    const logs = [];
    page.on('pageerror', err => errors.push(`PAGE ERROR: ${err.message}`));
    page.on('console', msg => {
        logs.push(`${msg.type()}: ${msg.text()}`);
        if (msg.type() === 'error')
            errors.push(`CONSOLE ERROR: ${msg.text()}`);
    });
    await page.goto('http://localhost:3000');
    // Wait for Monaco to be set on window
    await page.waitForFunction(() => !!window.monaco, { timeout: 10000 });
    console.log('Monaco loaded:', await page.evaluate(() => !!window.monaco));
    // Now check what globals are available
    const globals = await page.evaluate(() => ({
        monaco: !!window.monaco,
        setupMonaco: typeof window.setupMonaco,
        TerminalRenderer: typeof window.TerminalRenderer,
        IframeBridge: typeof window.IframeBridge,
        studio: !!window.studio
    }));
    console.log('Globals after Monaco load:', globals);
    // Wait more for studio to init
    await page.waitForTimeout(3000);
    const globalsAfter = await page.evaluate(() => ({
        monaco: !!window.monaco,
        setupMonaco: typeof window.setupMonaco,
        TerminalRenderer: typeof window.TerminalRenderer,
        IframeBridge: typeof window.IframeBridge,
        studio: !!window.studio
    }));
    console.log('Globals after waiting:', globalsAfter);
    console.log('Errors:', errors);
    console.log('Logs:', logs.slice(0, 20));
    // Check if studio.js is loaded
    const scripts = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('script[src]')).map(s => s.src);
    });
    console.log('Loaded scripts:', scripts);
    expect(errors).toHaveLength(0);
});
