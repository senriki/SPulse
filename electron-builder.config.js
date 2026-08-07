const fs = require('fs')
const path = require('path')
const pkg = require('./package.json')

const isPrerelease = pkg.version.includes('-')

// Ubuntu 23.10+ restricts unprivileged user namespaces via AppArmor, which
// crashes Electron's SUID sandbox init with a FATAL setuid_sandbox_host.cc
// abort. That check runs in native code during zygote-host startup, before
// main.js's JS executes — so app.commandLine.appendSwitch('no-sandbox') is
// too late to prevent it. Renaming the packaged binary and replacing it with
// a wrapper script that re-execs with --no-sandbox puts the flag in argv at
// OS exec time, ahead of any native startup.
function wrapLinuxSandbox(context) {
  if (context.electronPlatformName !== 'linux') return

  const execName = context.packager.executableName
  const realBinary = path.join(context.appOutDir, execName)
  const wrappedBinary = path.join(context.appOutDir, `${execName}.bin`)

  fs.renameSync(realBinary, wrappedBinary)
  fs.writeFileSync(
    realBinary,
    `#!/bin/sh\nDIR="$(cd "$(dirname "$0")" && pwd)"\nexec "$DIR/${execName}.bin" --no-sandbox "$@"\n`,
    { mode: 0o755 }
  )
}

module.exports = {
  appId: isPrerelease ? 'com.senriki.spulse.rc' : 'com.senriki.spulse',
  productName: isPrerelease ? 'SPulse RC' : 'SPulse',
  afterPack: wrapLinuxSandbox,
  asar: true,
  asarUnpack: [
    'node_modules/ffmpeg-static/**'
  ],
  files: [
    'main.js',
    'preload.js',
    'src/**/*',
    'node_modules/**/*',
    '!node_modules/**/{CHANGELOG.md,README.md,*.map,test,tests,__tests__,coverage}',
    '!src/fonts/'
  ],
  win: {
    icon: 'build/icon.ico',
    target: [{ target: 'nsis', arch: ['x64'] }],
    artifactName: '${productName}-Setup-${version}.${ext}'
  },
  mac: {
    icon: 'build/icon.icns',
    target: [{ target: 'dmg', arch: ['x64', 'arm64'] }],
    category: 'public.app-category.music'
  },
  linux: {
    icon: 'build/icon.png',
    target: [
      {
        target: 'AppImage',
        arch: ['x64']
      }
    ],
    category: 'AudioVideo',
    // Only reaches launches that go through a generated .desktop Exec= entry —
    // does not apply when the AppImage is run directly (double-click or bare
    // ./AppImage). The actual fix for the Ubuntu 23.10+ sandbox crash is the
    // afterPack binary wrapper above (wrapLinuxSandbox), which covers every
    // launch path. Left here as a harmless no-op-if-unused fallback for the
    // .desktop path.
    executableArgs: ['--no-sandbox']
  },
  nsis: {
    oneClick: true,
    perMachine: false,
    createDesktopShortcut: true,
    createStartMenuShortcut: true
  },
  dmg: {
    background: null,
    window: {
      width: 500,
      height: 300
    }
  },
  publish: {
    provider: 'github',
    owner: 'senriki',
    repo: 'SPulse',
    releaseType: 'release'
  }
}
