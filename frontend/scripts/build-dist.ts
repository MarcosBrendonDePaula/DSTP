#!/usr/bin/env bun
/**
 * DSTP distribution builder.
 *
 * Produces a self-contained folder `dist-pkg/` with:
 *   - dstp-server.exe (Windows) / dstp-server (Linux/Mac) — compiled Bun binary
 *   - public/ — static frontend assets (Vite build output)
 *   - README.txt — minimal instructions
 *
 * Usage:
 *   bun run scripts/build-dist.ts
 *
 * The compiled binary serves both the API and the static frontend on port 3000.
 * End users just double-click the executable. The mod talks to 127.0.0.1:3000.
 */

import { $ } from 'bun'
import { existsSync, mkdirSync, rmSync, cpSync, writeFileSync } from 'fs'
import { join } from 'path'

const ROOT = join(import.meta.dir, '..')
const DIST_PKG = join(ROOT, 'dist-pkg')
const TARGETS = {
  'win32-x64': 'bun-windows-x64',
  'linux-x64': 'bun-linux-x64',
  'darwin-arm64': 'bun-darwin-arm64',
} as const

const currentTarget = process.argv[2] as keyof typeof TARGETS | undefined

async function main() {
  console.log('🧹 Clean dist-pkg/')
  if (existsSync(DIST_PKG)) rmSync(DIST_PKG, { recursive: true, force: true })
  mkdirSync(DIST_PKG, { recursive: true })

  console.log('📦 Build frontend (vite)...')
  await $`cd ${ROOT} && bunx vite build --outDir dist-pkg/public --emptyOutDir`

  console.log('⚙  Compile backend...')
  const targets = currentTarget ? [currentTarget] : (Object.keys(TARGETS) as Array<keyof typeof TARGETS>)

  for (const t of targets) {
    const bunTarget = TARGETS[t]
    const ext = t.startsWith('win') ? '.exe' : ''
    const outFile = join(DIST_PKG, `dstp-server-${t}${ext}`)
    console.log(`   → ${t} (${bunTarget})`)
    await $`cd ${ROOT} && bun build app/server/index.ts --compile --target=${bunTarget} --outfile=${outFile} --env NODE_ENV=production`
  }

  // On Windows, copy the default-target binary as `dstp-server.exe` for convenience.
  if (existsSync(join(DIST_PKG, 'dstp-server-win32-x64.exe'))) {
    cpSync(join(DIST_PKG, 'dstp-server-win32-x64.exe'), join(DIST_PKG, 'dstp-server.exe'))
  }

  writeFileSync(join(DIST_PKG, 'README.txt'), README_TEXT)
  writeFileSync(join(DIST_PKG, 'start.bat'), START_BAT)

  console.log('✅ Done: dist-pkg/')
  console.log('   Run dstp-server.exe (or ./dstp-server on Linux/Mac)')
}

const README_TEXT = `DSTP — Don't Starve Together Admin Panel
==========================================

HOW TO RUN

  Windows:  double-click start.bat  (or run dstp-server.exe)
  Linux:    ./dstp-server-linux-x64
  Mac:      ./dstp-server-darwin-arm64

The server starts on http://127.0.0.1:3000.
Open that URL in a browser to access the admin panel.

FIRST-TIME SETUP

  1. Install the DSTP mod on your Don't Starve Together server.
  2. Set BACKEND_URL in the mod config to:  http://127.0.0.1:3000
     (other URLs will NOT work — DST only allows localhost.)
  3. Start the world as admin, type #panel in chat — the browser opens
     automatically with a one-shot access link.

DATA

  All data is stored in a 'data/' folder created next to the executable.
  Keep that folder if you want to preserve your flows, logs, and passwords.

REMOTE ACCESS

  DST's Lua sandbox only permits 127.0.0.1 for mod HTTP calls, so the
  mod must always talk to localhost. To access the panel remotely:

    - Port-forward 3000 on your router, or
    - Use Cloudflare Tunnel / ngrok / Tailscale to expose 127.0.0.1:3000.

  Don't change BACKEND_URL in the mod — only change how you reach the
  web panel from your browser.

SOURCE

  https://github.com/MarcosBrendonDePaula/DSTP
`

const START_BAT = `@echo off
title DSTP Server
echo Starting DSTP...
echo Panel:  http://127.0.0.1:3000
echo.
dstp-server.exe
pause
`

main().catch(err => {
  console.error('Build failed:', err)
  process.exit(1)
})
