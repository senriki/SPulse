const pkg = require('./package.json')

const isPrerelease = pkg.version.includes('-')

module.exports = {
  appId: isPrerelease ? 'com.senriki.spulse.rc' : 'com.senriki.spulse',
  productName: isPrerelease ? 'SPulse RC' : 'SPulse',
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
    // ./AppImage), which is why it alone didn't fix the Ubuntu 23.10+ sandbox
    // crash. The actual fix is the platform-gated
    // app.commandLine.appendSwitch('no-sandbox') in main.js, which covers every
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
