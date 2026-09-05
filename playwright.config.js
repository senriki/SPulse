'use strict'

// Electron E2E config — no browser `projects` needed since every test drives
// the packaged app directly via `_electron.launch()`, not a browser context.
module.exports = {
  testDir: './e2e',
  timeout: 30_000,
  retries: 0,
  reporter: 'list',
}
