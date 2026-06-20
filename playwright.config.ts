import { defineConfig } from '@playwright/test';

const PORT = process.env.PORT || '3000';

export default defineConfig({
  testDir: './tests/e2e',
  workers: 1,
  testIgnore: [
    /debug-.*\.test\.ts/,
    /qa-.*\.test\.ts/,
    /check-file-properties\.test\.ts/,
    /resize-(click-first|diagnostic|during-drag|panel-follow|visual-follow)\.test\.ts/,
    /safari-folder-picker\.test\.ts/,
    /verify-.*\.test\.ts/,
  ],
  timeout: 30000,
  use: {
    baseURL: `http://localhost:${PORT}`,
  },
});
