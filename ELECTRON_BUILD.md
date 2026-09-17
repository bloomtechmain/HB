# Building the POS App as a Windows Installer (.exe)

## Overview

The Electron app packages the React frontend and Express backend together, with a bundled local Postgres (`embedded-postgres`). No license server, no activation step — installing and launching it is all it takes.

---

## Prerequisites

- Node.js 18+
- Windows (for building `.exe`) or use a CI/CD service

## Install all dependencies

```bash
# From the repo root:
npm install
npm install --prefix apps/pos/backend
npm install --prefix apps/pos/frontend
```

## Add an app icon (optional but recommended)

Place your icon files in `build-assets/`:
- `icon.ico` (Windows — 256×256 recommended)
- `icon.icns` (macOS)
- `icon.png` (Linux — 512×512)

## Build the installer

```bash
npm run electron:build
```

This will:
1. Compile the TypeScript backend → `apps/pos/backend/dist/`
2. Build the React frontend → `apps/pos/frontend/dist/`
3. Package everything with Electron
4. Create the NSIS installer → `dist-electron/BloomPOS Setup <version>.exe`

---

## What Happens on First Launch

1. Customer installs and opens the app.
2. The app starts its bundled local Postgres, applies `database/schema.sql` (fresh install) or catches up any missing columns via the backend's incremental migrations, then opens straight into the app — no activation, no license key.
3. Default login is whatever `database/schema.sql` seeds (see the root `README.md`).

---

## Multi-Terminal / LAN Mode

Several tills on the same network can share one machine's database. Any standalone install is already a valid "Server" — pairing another till to it is done from **Settings → Multi-Terminal → Connect to a Server instead** on the till you want to become a Terminal.

---

## Folder Structure

```
apps/
├── pos/
│   ├── electron/
│   │   ├── main.js          — Electron main process
│   │   ├── machineId.js     — Stable machine fingerprint (used by Multi-Terminal pairing)
│   │   └── splash.html      — Loading screen
│   ├── backend/             — Express API (TypeScript)
│   └── frontend/            — React app (TypeScript + Vite)
build-assets/        — Icons and NSIS script
electron-builder.yml — Build configuration
package.json         — Root package with build scripts
```

---

## Development Mode (Without Building .exe)

To test the Electron app during development:

```bash
# Build backend and frontend first
npm run build:all

# Then launch Electron
npm run electron:dev
```

The Electron app loads the backend on port 5000, which serves the compiled frontend.
