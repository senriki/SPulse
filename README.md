# SPulse

[![Latest Release](https://img.shields.io/github/v/release/senriki/SPulse?label=release&style=flat-square&logo=github)](https://github.com/senriki/SPulse/releases/latest)
[![License](https://img.shields.io/github/license/senriki/SPulse?style=flat-square)](./LICENSE)
[![Downloads](https://img.shields.io/github/downloads/senriki/SPulse/total?style=flat-square&logo=github)](https://github.com/senriki/SPulse/releases)
[![CI](https://img.shields.io/github/actions/workflow/status/senriki/SPulse/ci.yml?branch=main&label=CI&style=flat-square&logo=githubactions)](https://github.com/senriki/SPulse/actions/workflows/ci.yml)

Desktop app for creating MP4 waveform visualizer videos from audio files. Runs fully offline.

![SPulse preview](docs/assets/img/preview.png)

Built with Electron, Web Audio API, Canvas 2D, and FFmpeg.

---

## Download

| Platform | Link |
|---|---|
| Windows 10/11 | [Download .exe](https://github.com/senriki/SPulse/releases/latest/download/SPulse-latest-win.exe) |
| macOS (Apple Silicon, macOS 13 Ventura+) | [Download .dmg](https://github.com/senriki/SPulse/releases/latest/download/SPulse-latest-mac-arm64.dmg) |
| macOS (Intel, macOS 13 Ventura+) | [Download .dmg](https://github.com/senriki/SPulse/releases/latest/download/SPulse-latest-mac-x64.dmg) |
| Linux | [Download .AppImage](https://github.com/senriki/SPulse/releases/latest/download/SPulse-latest-linux.AppImage) |

Links always point to the latest stable release. Looking for a portable Windows build, older versions, or a release candidate? See [all releases](https://github.com/senriki/SPulse/releases).

**macOS 12 or older?** Stay on [v1.3.0](https://github.com/senriki/SPulse/releases/tag/v1.3.0) — v1.4.0 raises the floor to macOS 13 Ventura and will not launch on older systems. The in-app auto-updater does not check OS compatibility before offering an update, so upgrading manually past v1.3.0 on macOS 12 or older is not recommended.

---

## Requirements

- Node.js 22.12+
- npm 10+
- A display (Windows or macOS host; WSL2 headless is not supported)

## Getting Started

```bash
npm install
npm start
```

On Linux/macOS/WSL, `make run` works the same way if you have Make installed.

## Commands

| npm script | `make` equivalent (Unix only) | Description |
|---|---|---|
| `npm start` | `make run` | Start the app in development mode |
| `npm install` | `make install` | Install dependencies |
| `npm run build` | `make build` | Package for the current platform |
| `npm run build:win` | `make build-win` | Build Windows installer (.exe via NSIS) |
| `npm run build:win:portable` | `make build-win-portable` | Build Windows portable .exe (no install needed, good for quick testing) |
| `npm run build:mac` | `make build-mac` | Build macOS disk image (.dmg) |
| `npm run build:linux` | `make build-linux` | Build Linux AppImage |
| `npm run icon` | `make icon` | Regenerate app icons in `build/` |
| `npm run clean` | `make clean` | Remove `dist/` and `out/` build artifacts |

The `npm run ...` commands work on every platform, including Windows without Make installed. The `Makefile` is an optional convenience shortcut for Unix-like shells (Linux/macOS/WSL).

Output is written to `dist/`.

---

## Features

- **Import**: MP3, WAV, FLAC, AAC, OGG, M4A — drag-and-drop or Ctrl+O
- **6 visualizer styles**: Classic Bar, Mirror Bar, Smooth Line, Filled Wave, Radial Pulse, Spectrum Glow
- **Drag to reposition**: click and drag the visualizer directly on the canvas to adjust its vertical position — syncs with the Y Offset slider in the panel
- **Backgrounds**: solid color, linear gradient, static image (with blur/darken), looping video — thumbnail preview appears in the panel immediately after selecting a file
- **Text overlay**: title + artist, 5 positions, custom XY, font/size/color/opacity
- **Export**: MP4 via FFmpeg — Full HD, 4K, Shorts/Reels (9:16), Square (1:1), or custom resolution; 24/30/60 fps; H.264 or H.265; hardware-accelerated encoding via NVIDIA NVENC, AMD AMF, or Intel QSV (auto-detected, with manual override)
- **Project save/load**: `.spx` JSON format preserves all settings and the audio file path
- **Undo/redo**: 20-step history for visualizer style changes (Ctrl+Z / Ctrl+Y)
- **Auto-update**: checks GitHub Releases on startup and downloads updates in the background; a banner appears when a new version is ready to install

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+O` | Open audio file |
| `Space` | Play / Pause |
| `Ctrl+E` | Start export |
| `Ctrl+S` | Save project |
| `Ctrl+Z` | Undo |
| `Ctrl+Y` | Redo |
| `Ctrl+Q` | Quit |
| `Escape` | Close modal |

---

## Known Issues & Tips

### Windows: SmartScreen warning on install

The installer is not code-signed, so Windows SmartScreen will show an "Unknown publisher" warning the first time it runs. Click **More info → Run anyway** to proceed. The warning disappears over time as more users install the app and Microsoft builds reputation for the binary.

To eliminate the warning permanently, a paid code signing certificate (OV or EV) from a CA such as DigiCert or Sectigo is required.

### Windows: export blocked by Controlled Folder Access

Windows Defender's **Ransomware protection → Controlled folder access** blocks apps from writing to protected folders (Desktop, Documents, Pictures, etc.). If export fails silently or with a permissions error, either:

1. Choose an output folder outside the protected list (e.g. a subfolder you created in `C:\Users\<you>\Videos`)
2. Or whitelist SPulse: **Windows Security → Virus & threat protection → Ransomware protection → Allow an app through Controlled folder access → Add SPulse**

### Linux: AppImage crashes on launch (Ubuntu 23.10+/24.04)

Older SPulse builds can crash immediately with:

```
FATAL:setuid_sandbox_host.cc(158)] The SUID sandbox helper binary was found, but is not configured correctly.
```

This happens because Ubuntu 23.10+ restricts unprivileged user namespaces via AppArmor by default, which conflicts with Electron's SUID sandbox. Current releases work around this automatically. If you're on an older build and hit this crash, run the AppImage with:

```bash
./SPulse-latest-linux.AppImage --no-sandbox
```

or update to the latest release.

### Linux: AppImage doesn't launch on double-click

AppImages need the executable bit set, which most file managers and browsers don't set automatically on downloaded files. Either run once from a terminal:

```bash
chmod +x SPulse-latest-linux.AppImage
```

or right-click the file → **Properties → Permissions → Allow executing file as program** (wording varies by desktop environment) — then double-click normally.

---

## Packaging

Before running `npm run build` (or `make build`), place app icons in `build/`:

```
build/icon.ico    — Windows  (256×256 multi-resolution ICO)
build/icon.icns   — macOS    (1024×1024 ICNS)
build/icon.png    — Linux    (512×512 PNG)
```

See `build/README.md` for icon creation instructions.

Installer size target: < 250 MB. The bundled FFmpeg binary (~50–80 MB depending on platform) is the largest single component.

### Releases

Stable builds are tagged `vX.Y.Z` and published as the "Latest Release" on GitHub. Release candidates are tagged `vX.Y.Z-rc.N` and published as pre-releases (amber app icon, distinct from stable's cyan) so they can be tested without affecting auto-update for stable users. See `AGENTS.md` → Release Flow for the full tagging process.

---

## Contributing

Want to help? See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for dev setup, code style, commit conventions, and how to submit a PR.

---

## License

MIT — see individual dependency licenses for FFmpeg (LGPL v2.1+), Inter (SIL OFL 1.1), and JetBrains Mono (Apache 2.0).

The app's Help > About screen lists all open-source component licenses as required by the FFmpeg LGPL.

---

## Connect

If you'd like to follow along or support future development:

[![X](https://img.shields.io/badge/X-%40SenrikiSorani-black?logo=x&style=flat-square)](https://x.com/SenrikiSorani)
[![Website](https://img.shields.io/badge/website-singularitypulse.com-blueviolet?style=flat-square)](https://singularitypulse.com/)
[![Patreon](https://img.shields.io/badge/Patreon-support-f96854?logo=patreon&logoColor=white&style=flat-square)](https://www.patreon.com/cw/SenrikiSorani)
[![YouTube](https://img.shields.io/badge/YouTube-%40senrikis-red?logo=youtube&logoColor=white&style=flat-square)](https://www.youtube.com/@senrikis)
