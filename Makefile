# This Makefile is an optional convenience wrapper for Unix-like shells
# (Linux/macOS/WSL). Windows contributors without Make installed should use the
# npm scripts directly: npm start, npm run build*, npm run icon, npm run clean.
.PHONY: run build build-win build-win-portable build-mac build-linux icon install clean

# ── Dev ───────────────────────────────────────────────────────────────────────
run:
	npm start

install:
	npm install

# ── Icons ─────────────────────────────────────────────────────────────────────
icon:
	node scripts/gen-icon.js

# ── Build ─────────────────────────────────────────────────────────────────────
build:
	npm run build

build-win:
	npm run build:win

build-win-portable:
	npm run build:win:portable

build-mac:
	npm run build:mac

build-linux:
	npm run build:linux

# ── Housekeeping ──────────────────────────────────────────────────────────────
clean:
	rm -rf dist out
