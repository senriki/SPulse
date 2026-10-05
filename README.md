# SPulse

[![Latest Release](https://img.shields.io/github/v/release/senriki/SPulse?label=release&style=flat-square&logo=github)](https://github.com/senriki/SPulse/releases/latest)
[![License](https://img.shields.io/github/license/senriki/SPulse?style=flat-square)](./LICENSE)
[![Downloads](https://img.shields.io/github/downloads/senriki/SPulse/total?style=flat-square&logo=github)](https://github.com/senriki/SPulse/releases)
[![CI](https://img.shields.io/github/actions/workflow/status/senriki/SPulse/ci.yml?branch=main&label=CI&style=flat-square&logo=githubactions)](https://github.com/senriki/SPulse/actions/workflows/ci.yml)

SPulse is a waveform visualizer you can run in the **browser** or as a **desktop** app. Same editor, same styles — no accounts, no database.

Desktop app by [Senriki](https://github.com/senriki). Web version and UI rebuild by [Coffet](https://github.com/Coffet).

Made for the [Singularity Pulse](https://singularitypulse.com) community. Find it with the other creator resources at [singularitypulse.com/resources](https://singularitypulse.com/resources#spulse).

- **Web** — Node/Express serves the static UI. Design, export **WebM** (MediaRecorder, up to 1080p / 30fps, real time), and download a portable `.spulse` project. Refreshing the tab discards the session unless you saved that file.
- **Desktop** — Electron + bundled FFmpeg. Offline **MP4** export (up to 4K / 60fps, GPU encoders), last-session restore, recent files, and auto-update.

The web **landing** stays the original dark cyan start screen. The **studio** is a Figma-style editor: top bar, large canvas, style chips under the preview, and one right inspector (Look / Scene / Export). Light and dark themes apply to the studio only.

![SPulse landing](docs/preview-landing.png)

![SPulse studio, dark theme](docs/preview-studio.png)

![SPulse studio, light theme](docs/preview-studio-light.png)

Built with vanilla JS, Web Audio API, Canvas 2D, Express (web host), and Electron + FFmpeg (desktop).

---

## Use in the browser

```bash
npm install
npm run start:web
```

That runs `node server.js` and should stay in the foreground:

```
SPulse web  http://localhost:3000  (v1.4.0)
```

Leave that terminal open. Open **[http://localhost:3000](http://localhost:3000)**. Pick **New project** or **Import project** (`.spulse`), then load audio and design as usual.

**Stop the server** with **Ctrl+C** in that same terminal. There is no `npm stop`. If the `PS>` / `$` prompt comes back right after the URL, the process already exited (usually port 3000 is taken) — Ctrl+C will not help. On Windows, find and kill the leftover process, then start again:

```powershell
netstat -ano | findstr :3000
taskkill /PID <pid> /F
npm run start:web
```

`npm start` launches the **Electron desktop** app, not the browser server.

The server only hosts files from `src/` (plus `/api/version` and `/api/upstream` for the update check). Encoding happens in the visitor’s browser. There is no upload API and no login.

When `senriki/SPulse` `main` is ahead of this host, a banner offers **Reload** (after you pull/redeploy) or **View on GitHub**. Help → Check for Updates… does the same check on demand.

To keep work, use **Export Project** / Ctrl+S for a `.spulse` file. Open that file in the desktop app if you need MP4.

---

## Download (desktop)

| Platform                                 | Link                                                                                                          |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Windows 10/11                            | [Download .exe](https://github.com/senriki/SPulse/releases/latest/download/SPulse-latest-win.exe)             |
| macOS (Apple Silicon, macOS 13 Ventura+) | [Download .dmg](https://github.com/senriki/SPulse/releases/latest/download/SPulse-latest-mac-arm64.dmg)       |
| macOS (Intel, macOS 13 Ventura+)         | [Download .dmg](https://github.com/senriki/SPulse/releases/latest/download/SPulse-latest-mac-x64.dmg)         |
| Linux                                    | [Download .AppImage](https://github.com/senriki/SPulse/releases/latest/download/SPulse-latest-linux.AppImage) |


Links always point to the latest stable release. Looking for a portable Windows build, older versions, or a release candidate? See [all releases](https://github.com/senriki/SPulse/releases).

**macOS 12 or older?** Stay on [v1.3.0](https://github.com/senriki/SPulse/releases/tag/v1.3.0) — v1.4.0 raises the floor to macOS 13 Ventura and will not launch on older systems. The in-app auto-updater does not check OS compatibility before offering an update, so upgrading manually past v1.3.0 on macOS 12 or older is not recommended.

---

## Requirements

**Web**

- Node.js 22.12+
- npm 10+
- A current Chromium-based browser (Chrome / Edge) recommended for MediaRecorder export

**Desktop**

- Same Node/npm for building from source
- A display (Windows or macOS host; WSL2 headless is not supported)

## Getting Started

```bash
npm install
npm run start:web  # web app at http://localhost:3000 — stop with Ctrl+C
npm start          # Electron desktop
```

On Linux/macOS/WSL, `make run-web` / `make run` work the same way if you have Make installed.

## Commands

| npm script                   | `make` equivalent (Unix only) | Description                                                             |
| ---------------------------- | ----------------------------- | ----------------------------------------------------------------------- |
| `npm run start:web`          | `make run-web`                | Start the web app at [http://localhost:3000](http://localhost:3000). Stop with Ctrl+C in that terminal. |
| `npm start`                  | `make run`                    | Start the Electron desktop app                                          |
| `npm install`                | `make install`                | Install dependencies                                                    |
| `npm run build`              | `make build`                  | Package for the current platform                                        |
| `npm run build:win`          | `make build-win`              | Build Windows installer (.exe via NSIS)                                 |
| `npm run build:win:portable` | `make build-win-portable`     | Build Windows portable .exe (no install needed, good for quick testing) |
| `npm run build:mac`          | `make build-mac`              | Build macOS disk image (.dmg)                                           |
| `npm run build:linux`        | `make build-linux`            | Build Linux AppImage                                                    |
| `npm run icon`               | `make icon`                   | Regenerate app icons in `build/`                                        |
| `npm run clean`              | `make clean`                  | Remove `dist/` and `out/` build artifacts                               |


The `npm run ...` commands work on every platform, including Windows without Make installed. The `Makefile` is an optional convenience shortcut for Unix-like shells (Linux/macOS/WSL).

Output is written to `dist/`.

---

## Features

- **Studio**: top bar (audio, undo/redo, theme, export), large canvas, style chips, one inspector — Look (waveform), Scene (background + overlay), Export
- **Light / dark**: studio theme toggle, remembered in the browser. Landing always stays dark cyan
- **Import**: MP3, WAV, FLAC, AAC, OGG, M4A — drag-and-drop, **Open audio** in the top bar, or Ctrl+O. Loading a new file replaces the current track (playback included)
- **6 visualizer styles**: Classic Bar, Mirror Bar, Smooth Line, Filled Wave, Radial Pulse, Spectrum Glow
- **Drag to reposition**: click and drag the visualizer on the canvas — syncs with Y Offset in Look
- **Backgrounds**: solid color, linear gradient, static image (with blur/darken), looping video — thumbnail preview in Scene after you pick a file
- **Text overlay**: title + artist, 5 positions, custom XY, font/size/color/opacity (Scene)
- **Export (web)**: WebM via MediaRecorder, capped at 1080p / 30fps, recorded in real time in the browser
- **Export (desktop)**: MP4 via FFmpeg (Full HD, 4K, Shorts/Reels, Square, custom; 24/30/60 fps; H.264/H.265; NVENC/AMF/QSV)
- **Landing (web)**: first screen offers New project or Import project; desktop skips this and opens the studio
- **Projects**: one portable `.spulse` format for everything (embedded audio, works web ↔ desktop)
- **Undo/redo**: 20-step history for visualizer style changes (Ctrl+Z / Ctrl+Y)
- **Desktop extras**: last-session restore, recent files, auto-update from GitHub Releases

## Keyboard Shortcuts

| Shortcut       | Action                                     |
| -------------- | ------------------------------------------ |
| `Ctrl+O`       | Open audio file                            |
| `Ctrl+N`       | New session                                |
| `Ctrl+Shift+R` | Reset settings (keep audio)                |
| `Space`        | Play / Pause                               |
| `Ctrl+E`       | Start export                               |
| `Ctrl+S`       | Save / download project (`.spulse`)        |
| `Ctrl+Z`       | Undo                                       |
| `Ctrl+Y`       | Redo                                       |
| `F11`          | Toggle canvas fullscreen                   |
| `Ctrl+Q`       | Quit (desktop)                             |
| `Escape`       | Close modal                                |

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

Want to help? See [CONTRIBUTING.md](./CONTRIBUTING.md) for dev setup, code style, commit conventions, and how to submit a PR.

---

## License

MIT — see individual dependency licenses for FFmpeg (LGPL v2.1+), Inter (SIL OFL 1.1), and JetBrains Mono (Apache 2.0).

The app's Help > About screen lists all open-source component licenses as required by the FFmpeg LGPL.

---

## Credits

| Role | Credit |
|---|---|
| Original desktop app | [Senriki](https://github.com/senriki) — Electron, FFmpeg export, visualizer engine |
| Web version & UI rebuild | [Coffet](https://github.com/Coffet) — browser runtime, landing, and rebuilt editor UI |

Everyone who has contributed code is listed on the [contributors page](https://github.com/senriki/SPulse/graphs/contributors), and each release's notes credit the contributors to that release.

---

## Connect

If you'd like to follow along or support Senriki’s desktop work:

[X](https://x.com/SenrikiSorani)
[Website](https://singularitypulse.com/)
[Patreon](https://www.patreon.com/cw/SenrikiSorani)
[YouTube](https://www.youtube.com/@senrikis)
