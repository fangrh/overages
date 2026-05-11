import { test, expect } from '@playwright/test';
import path from 'path';

test('check global exports and timing', async ({ page }) => {
  const errors: string[] = [];
  const logs: string[] = [];

  page.on('pageerror', err => errors.push(`PAGE ERROR: ${err.message}`));
  page.on('console', msg => {
    logs.push(`${msg.type()}: ${msg.text()}`);
    if (msg.type() === 'error') errors.push(`CONSOLE ERROR: ${msg.text()}`);
  });

  await page.goto('http://localhost:3000');

  // Wait for Monaco to be set on window
  await page.waitForFunction(() => !!(window as any).monaco, { timeout: 10000 });
  console.log('Monaco loaded:', await page.evaluate(() => !!(window as any).monaco));

  // Now check what globals are available
  const globals = await page.evaluate(() => ({
    monaco: !!(window as any).monaco,
    setupMonaco: typeof (window as any).setupMonaco,
    TerminalRenderer: typeof (window as any).TerminalRenderer,
    IframeBridge: typeof (window as any).IframeBridge,
    studio: !!(window as any).studio
  }));
  console.log('Globals after Monaco load:', globals);

  // Wait more for studio to init
  await page.waitForTimeout(3000);

  const globalsAfter = await page.evaluate(() => ({
    monaco: !!(window as any).monaco,
    setupMonaco: typeof (window as any).setupMonaco,
    TerminalRenderer: typeof (window as any).TerminalRenderer,
    IframeBridge: typeof (window as any).IframeBridge,
    studio: !!(window as any).studio
  }));
  console.log('Globals after waiting:', globalsAfter);
  console.log('Errors:', errors);
  console.log('Logs:', logs.slice(0, 20));

  // Check if studio.js is loaded
  const scripts = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('script[src]')).map(s => (s as HTMLScriptElement).src);
  });
  console.log('Loaded scripts:', scripts);

  expect(errors).toHaveLength(0);
});