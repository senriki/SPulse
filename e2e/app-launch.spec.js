'use strict'

const { test, expect, _electron } = require('@playwright/test')

// Bundled fonts (src/styles/main.css) are optional local assets, not checked
// into git — see that file's own comment. On a machine without JetBrains Mono
// installed, the CSS's url() fallback genuinely 404s; this is documented,
// environment-dependent, and not a regression, so it's the one console error
// this smoke test tolerates (matched by source URL, since Chromium's own
// error text is a generic "Failed to load resource" with no filename in it).
const isKnownStartupError = msg => /JetBrainsMono\.woff2$/.test(msg.location().url || '')

test('app launches, main window renders, no console errors on startup', async () => {
  const consoleErrors = []
  let electronApp

  try {
    electronApp = await _electron.launch({ args: ['.'] })

    const window = await electronApp.firstWindow()
    window.on('console', msg => {
      if (msg.type() === 'error' && !isKnownStartupError(msg)) consoleErrors.push(msg.text())
    })

    await window.waitForLoadState('domcontentloaded')
    await expect(window).toHaveTitle('SPulse')
    await expect(window.locator('body')).toBeVisible()

    expect(consoleErrors).toEqual([])
  } finally {
    await electronApp?.close()
  }
})
