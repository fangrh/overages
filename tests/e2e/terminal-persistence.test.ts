import { test, expect } from '@playwright/test';

// E2E proof for "refresh-resilient terminals": a process started BEFORE a
// browser refresh is still running AFTER the refresh.
//
// Mechanism: we start `cat` in the terminal. `cat` echoes every line of stdin.
// We then reload the page, which drops the WebSocket; the server's tmux-backed
// route kills only the client PTY, leaving the tmux session (and the `cat`
// inside it) alive. On reload the frontend reuses the persisted primary session
// id and reattaches. We type a unique marker into the reattached terminal.
//
// Meaningfulness: typing into a terminal locally echoes the keystrokes whether
// `cat` is alive or not, so "marker appears" alone is not enough. We assert
// `command not found` is ABSENT — a fresh shell (had `cat` died and a new shell
// taken over the session) would report `command not found` for our non-command
// marker, while a surviving `cat` simply echoes it verbatim. This is the strict
// `cat`-survived-the-refresh invariant.
test('terminal process survives browser refresh', async ({ page }) => {
  // Capture browser-console errors so we can fail the test on stray noise
  // (we expect a clean run). Uncaught network hiccups during reload are
  // tolerated; we only surface genuine page errors.
  const pageErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));

  // A run-scoped unique suffix so leftover output from prior runs can't match.
  const suffix = `${Date.now()}`;
  const beforeMarker = `PERSIST_BEFORE_${suffix}`;
  const afterMarker = `PERSIST_AFTER_${suffix}`;

  await page.goto('http://localhost:3000', { waitUntil: 'load' });

  // Activate the "Terminal" tab in the bottom console. The studio's TabManager
  // renders each tab button as `.panel-tab-btn` with a `data-tab` attribute
  // (frontend/tabManager.ts:90-92); the xterm tab is registered with
  // id 'terminal' (frontend/studio.ts:1525-1526).
  const termTab = page.locator('.panel-tab-btn[data-tab="terminal"]');
  await termTab.click();

  // Wait for the xterm to render and connect.
  const rows = page.locator('.xterm-rows');
  await expect(rows).toBeVisible({ timeout: 20000 });

  // Focus the xterm canvas so keyboard input reaches the shell.
  const xterm = page.locator('#terminal-xterm .xterm').first();
  await xterm.click();
  await page.waitForTimeout(800);

  // Start `cat` — it will echo every subsequent line of stdin verbatim.
  await page.keyboard.type('cat\n');
  await page.waitForTimeout(600);
  await page.keyboard.type(`${beforeMarker}\n`);
  await page.waitForTimeout(600);

  // Sanity (pre-refresh): our `cat` is echoing.
  let pre = (await rows.textContent()) || '';
  expect(pre).toContain(beforeMarker);

  // Refresh the browser. The WebSocket drops here; the server keeps the tmux
  // session alive. On reload the frontend reuses the persisted session id and
  // reattaches.
  await page.reload({ waitUntil: 'load' });

  // Re-activate the terminal tab and wait for xterm + WS reattach.
  await termTab.click();
  await expect(rows).toBeVisible({ timeout: 20000 });
  await xterm.click();
  // Allow tmux reattach + scrollback replay (~1s in practice).
  await page.waitForTimeout(1500);

  // Type the post-refresh marker into the reattached terminal.
  await page.keyboard.type(`${afterMarker}\n`);
  await page.waitForTimeout(900);

  const post = (await rows.textContent()) || '';

  // The marker must be echoed by the SURVIVING `cat`.
  expect(post).toContain(afterMarker);

  // Strict check — this is what makes the test non-vacuous: had `cat` died on
  // refresh and a fresh shell taken over, the marker (not a real command)
  // would produce `command not found`. A surviving `cat` echoes it cleanly.
  expect(post).not.toContain('command not found');
  expect(post).not.toMatch(/not found/i);

  // Pristine: no uncaught page errors during the run.
  expect(pageErrors, `unexpected page errors: ${pageErrors.join(' | ')}`).toEqual([]);
});
