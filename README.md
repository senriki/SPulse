# SPulse

Desktop app for creating MP4 waveform visualizer videos from audio files. Runs fully offline.

Built with Electron, Web Audio API, Canvas 2D, and FFmpeg.

---

## Requirements

- Node.js 18+
- npm 9+
- A display (Windows or macOS host; WSL2 headless is not supported)

## Getting Started

```bash
npm install
make run
```

## Commands

| Command | Description |
|---|---|
| `make run` | Start the app in development mode |
| `make install` | Install dependencies |
| `make build` | Package for the current platform |
| `make build-win` | Build Windows installer (.exe via NSIS) |
| `make build-mac` | Build macOS disk image (.dmg) |
| `make build-linux` | Build Linux AppImage |
| `make clean` | Remove `dist/` and `out/` build artifacts |

Output is written to `dist/`.

---

## Features

- **Import**: MP3, WAV, FLAC, AAC, OGG, M4A — drag-and-drop or Ctrl+O
- **6 visualizer styles**: Classic Bar, Mirror Bar, Smooth Line, Filled Wave, Radial Pulse, Spectrum Glow
- **Backgrounds**: solid color, linear gradient, static image (with blur/darken), looping video
- **Text overlay**: title + artist, 5 positions, custom XY, font/size/color/opacity
- **Export**: MP4 via FFmpeg — Full HD, 4K, Shorts/Reels (9:16), Square (1:1), or custom resolution; 24/30/60 fps; H.264 or H.265; hardware-accelerated encoding via NVIDIA NVENC, AMD AMF, or Intel QSV (auto-detected, with manual override)
- **Project save/load**: `.spx` JSON format preserves all settings and the audio file path
- **Undo/redo**: 20-step history for visualizer style changes (Ctrl+Z / Ctrl+Y)

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

## Packaging

Before running `make build`, place app icons in `build/`:

```
build/icon.ico    — Windows  (256×256 multi-resolution ICO)
build/icon.icns   — macOS    (1024×1024 ICNS)
build/icon.png    — Linux    (512×512 PNG)
```

See `build/README.md` for icon creation instructions.

Installer size target: < 250 MB. The bundled FFmpeg binary (~50–80 MB depending on platform) is the largest single component.

---

## License

MIT — see individual dependency licenses for FFmpeg (LGPL v2.1+), Inter (SIL OFL 1.1), and JetBrains Mono (Apache 2.0).

The app's Help > About screen lists all open-source component licenses as required by the FFmpeg LGPL.
