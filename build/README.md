# Build Assets

Place app icons here before running `npm run build`:

- `icon.ico`  — Windows (256x256, multi-resolution ICO)
- `icon.icns` — macOS (1024x1024 ICNS)
- `icon.png`  — Linux (512x512 PNG, also used as source for electron-builder)

## Creating icons from a single PNG

If you have a 1024x1024 source PNG (e.g. `icon-source.png`):

```bash
# macOS ICNS
mkdir icon.iconset
sips -z 16 16   icon-source.png --out icon.iconset/icon_16x16.png
sips -z 32 32   icon-source.png --out icon.iconset/icon_32x32.png
sips -z 128 128 icon-source.png --out icon.iconset/icon_128x128.png
sips -z 256 256 icon-source.png --out icon.iconset/icon_256x256.png
sips -z 512 512 icon-source.png --out icon.iconset/icon_512x512.png
iconutil -c icns icon.iconset

# Windows ICO (requires ImageMagick)
convert icon-source.png -resize 256x256 icon.ico

# Linux PNG
cp icon-source.png icon.png
```

electron-builder will automatically convert `icon.png` to the required sizes if
the platform-specific files are missing, but explicit files produce better results.
