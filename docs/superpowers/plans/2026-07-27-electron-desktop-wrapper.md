# Electron Desktop Wrapper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Package the existing Next.js frontend as an installable desktop binary (Windows/macOS/Linux) that runs the bundled Next standalone server locally and connects to the production backend.

**Architecture:** Electron main process forks the Next.js standalone server (`.next/standalone/server.js`) on a fixed localhost port using Electron's built-in Node (`ELECTRON_RUN_AS_NODE=1`), then loads `http://127.0.0.1:34115` in a `BrowserWindow`. The browser talks only same-origin to the local Next server; the Next BFF proxies `/api/*` to the production gateway via `GATEWAY_URL`. Backend and `frontend/` are not modified.

**Tech Stack:** Electron, electron-builder, Node child_process. Frontend is Next.js 16 (`output: "standalone"` already set).

## Global Constraints

- Product name is **"Andrey"** — the word "Rosneft"/"Роснефть" is BANNED in any displayed/user-facing text (`productName`, window title, app id label). Lowercase `rosneft` in paths stays.
- Fixed Next server port: **34115**.
- Backend gateway (baked into the build): **`http://85.192.26.113:8080`** as `GATEWAY_URL`.
- `NEXT_PUBLIC_API_URL` must be left **empty/unset** so the browser stays same-origin (no CORS).
- Do **not** modify anything under `frontend/src`, `backend/`, or `docker-compose.yml`. All new work lives in `desktop/`.
- All shell commands below assume you run them from the repository root `/Users/vbncursed/programming/rosneft` unless a `cwd` is stated. Use `git -C <repo-root>` if your shell cwd differs.

---

## File Structure

- `desktop/package.json` — Electron app manifest, deps, scripts, electron-builder config.
- `desktop/main.js` — Electron entry: fork Next server, wait for port, open window, kill child on quit.
- `desktop/check.mjs` — standalone self-check: boots the Next server as plain Node, polls it, exits 0/1.
- `desktop/build.mjs` — build script: `next build` → copy `static`/`public` into standalone → `electron-builder`.

---

### Task 1: Scaffold the desktop Electron package

**Files:**
- Create: `desktop/package.json`

**Interfaces:**
- Produces: an installable `desktop/` npm package exposing scripts `start`, `check`, `dist`; and an electron-builder `build` block used by later tasks.

- [ ] **Step 1: Create `desktop/package.json`**

```json
{
  "name": "andrey-desktop",
  "version": "1.0.0",
  "description": "Andrey desktop client",
  "main": "main.js",
  "author": "Andrey",
  "scripts": {
    "start": "electron .",
    "check": "node check.mjs",
    "dist": "node build.mjs"
  },
  "devDependencies": {
    "electron": "^33.0.0",
    "electron-builder": "^25.0.0"
  },
  "build": {
    "appId": "com.andrey.desktop",
    "productName": "Andrey",
    "files": ["main.js"],
    "extraResources": [
      { "from": "../frontend/.next/standalone", "to": "standalone" }
    ],
    "win": { "target": "nsis" },
    "mac": { "target": "dmg" },
    "linux": { "target": "AppImage" }
  }
}
```

- [ ] **Step 2: Install dependencies**

Run: `cd desktop && npm install`
Expected: `electron` and `electron-builder` install; `desktop/node_modules` created, no errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/vbncursed/programming/rosneft
git add desktop/package.json desktop/package-lock.json
git commit -m "feat(desktop): scaffold Electron package"
```

---

### Task 2: Standalone server self-check (the runnable test)

Proves the Next standalone server boots on port 34115 with the production `GATEWAY_URL` and serves the app — independent of Electron.

**Files:**
- Create: `desktop/check.mjs`

**Interfaces:**
- Consumes: `frontend/.next/standalone/server.js` (produced by `next build`; standalone output is already configured in `next.config.ts`).
- Produces: `desktop/check.mjs` — run with `node check.mjs`, exits `0` when the server answers with status `< 500`, else `1`.

- [ ] **Step 1: Write the self-check**

```js
// desktop/check.mjs — boot the Next standalone server, poll it, then kill it.
import { fork } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 34115;
const standaloneDir = path.join(__dirname, '..', 'frontend', '.next', 'standalone');

const server = fork(path.join(standaloneDir, 'server.js'), {
  cwd: standaloneDir,
  env: {
    ...process.env,
    GATEWAY_URL: 'http://85.192.26.113:8080',
    NEXT_PUBLIC_API_URL: '',
    PORT: String(PORT),
    HOSTNAME: '127.0.0.1',
  },
});

function poll(n) {
  http
    .get(`http://127.0.0.1:${PORT}/`, (res) => {
      res.resume();
      const ok = res.statusCode < 500;
      console.log(ok ? `OK ${res.statusCode}` : `BAD ${res.statusCode}`);
      server.kill();
      process.exit(ok ? 0 : 1);
    })
    .on('error', () => {
      if (n <= 0) {
        console.error('server did not start');
        server.kill();
        process.exit(1);
      }
      setTimeout(() => poll(n - 1), 100);
    });
}
poll(100);
```

- [ ] **Step 2: Run it before building the frontend — verify it fails**

Run: `cd desktop && node check.mjs`
Expected: FAIL — `server did not start` (or a fork error), exit code 1, because `frontend/.next/standalone/server.js` does not exist yet.

- [ ] **Step 3: Build the frontend once**

Run: `cd frontend && yarn build`
Expected: build succeeds; `frontend/.next/standalone/server.js` now exists.

- [ ] **Step 4: Run the self-check again — verify it passes**

Run: `cd desktop && node check.mjs`
Expected: PASS — prints `OK 200` (or another status `< 500`), exit code 0, process exits (server killed).

- [ ] **Step 5: Commit**

```bash
cd /Users/vbncursed/programming/rosneft
git add desktop/check.mjs
git commit -m "feat(desktop): standalone server boot self-check"
```

---

### Task 3: Electron main process — open the app window

**Files:**
- Create: `desktop/main.js`

**Interfaces:**
- Consumes: the same standalone `server.js` and env contract as `check.mjs` (port 34115, `GATEWAY_URL`, empty `NEXT_PUBLIC_API_URL`).
- Produces: `desktop/main.js` — Electron entry that forks the server, waits for the port, and loads `http://127.0.0.1:34115`.

- [ ] **Step 1: Write `desktop/main.js`**

```js
const { app, BrowserWindow } = require('electron');
const { fork } = require('node:child_process');
const http = require('node:http');
const path = require('node:path');

const PORT = 34115;
const GATEWAY_URL = 'http://85.192.26.113:8080';

// Dev: standalone lives in the sibling frontend build.
// Packaged: shipped as an extraResource next to the app.
const standaloneDir = app.isPackaged
  ? path.join(process.resourcesPath, 'standalone')
  : path.join(__dirname, '..', 'frontend', '.next', 'standalone');

let server = null;

function startServer() {
  server = fork(path.join(standaloneDir, 'server.js'), {
    cwd: standaloneDir,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1', // run Electron's Node as plain node
      GATEWAY_URL,
      NEXT_PUBLIC_API_URL: '',
      PORT: String(PORT),
      HOSTNAME: '127.0.0.1',
    },
  });
}

function waitForServer(retries = 100) {
  return new Promise((resolve, reject) => {
    const tryOnce = (n) => {
      http
        .get(`http://127.0.0.1:${PORT}/`, (res) => {
          res.resume();
          resolve();
        })
        .on('error', () => {
          if (n <= 0) return reject(new Error('server did not start'));
          setTimeout(() => tryOnce(n - 1), 100);
        });
    };
    tryOnce(retries);
  });
}

async function createWindow() {
  startServer();
  await waitForServer();
  const win = new BrowserWindow({ width: 1280, height: 800, title: 'Andrey' });
  await win.loadURL(`http://127.0.0.1:${PORT}`);
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (server) server.kill();
  app.quit();
});

app.on('before-quit', () => {
  if (server) server.kill();
});
```

- [ ] **Step 2: Launch the app in dev**

Run: `cd desktop && npm start`
Expected: an Electron window titled "Andrey" opens showing the login/app UI served from `http://127.0.0.1:34115`. (Requires Task 2's `yarn build` to have produced the standalone tree.)

- [ ] **Step 3: Verify backend connectivity**

In the running window, log in (password + 2FA). Expected: requests succeed — the Next BFF is proxying `/api/*` to `http://85.192.26.113:8080`. Close the window; verify the forked `server.js` process is gone (`pgrep -f standalone/server.js` returns nothing).

- [ ] **Step 4: Commit**

```bash
cd /Users/vbncursed/programming/rosneft
git add desktop/main.js
git commit -m "feat(desktop): Electron main process opens app window"
```

---

### Task 4: Build script and packaged binary

**Files:**
- Create: `desktop/build.mjs`

**Interfaces:**
- Consumes: `desktop/package.json` `build` block (Task 1), `desktop/main.js` (Task 3).
- Produces: platform installers under `desktop/dist/` (NSIS `.exe` / `.dmg` / `.AppImage`).

- [ ] **Step 1: Write `desktop/build.mjs`**

```js
// desktop/build.mjs — build frontend, fold static+public into standalone, package.
import { execSync } from 'node:child_process';
import { cpSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontend = path.join(__dirname, '..', 'frontend');
const standalone = path.join(frontend, '.next', 'standalone');

// 1. Build the Next standalone output.
execSync('yarn build', { cwd: frontend, stdio: 'inherit' });

// 2. standalone output does NOT copy these — do it manually (known Next quirk).
cpSync(path.join(frontend, '.next', 'static'), path.join(standalone, '.next', 'static'), {
  recursive: true,
});
cpSync(path.join(frontend, 'public'), path.join(standalone, 'public'), { recursive: true });

// 3. Package for the current OS (add --win/--mac/--linux to cross-build where supported).
execSync('electron-builder', { cwd: __dirname, stdio: 'inherit' });
```

- [ ] **Step 2: Build a binary for the current OS**

Run: `cd desktop && npm run dist`
Expected: frontend builds, static/public are copied into the standalone tree, electron-builder emits an installer into `desktop/dist/` for the host OS.

- [ ] **Step 3: Install and launch the produced binary**

Install the artifact from `desktop/dist/` (e.g. mount the `.dmg` on macOS; on macOS unsigned builds: right-click → Open to bypass Gatekeeper). Expected: the app launches, opens the "Andrey" window, and reaches the production backend exactly as in dev.

- [ ] **Step 4: Add `desktop/dist/` to gitignore and commit the build script**

```bash
cd /Users/vbncursed/programming/rosneft
printf 'node_modules/\ndist/\n' > desktop/.gitignore
git add desktop/build.mjs desktop/.gitignore
git commit -m "feat(desktop): build script and electron-builder packaging"
```

- [ ] **Step 5 (per-OS packaging note):** Windows (`nsis`) and Linux (`AppImage`) targets build natively on their own OS; from macOS you can also build the Linux target. Windows installers are best built on Windows (or CI). macOS `.dmg` needs macOS. For all three platforms, run `npm run dist` once on each OS (or use a CI matrix). No code changes are needed between platforms — same `build` block covers all three targets.

---

## Notes / Known Ceilings (from the design spec)

- **SSE conversion progress buffers** through the Next proxy; the progress bar may look stuck until conversion completes. A 4-second `router.refresh` poll fallback already exists. Upgrade (browser → gateway directly + CORS) only if it actually annoys.
- **Passkey/WebAuthn is origin-bound.** Password + 2FA (cookie) works as-is. For passkey in the desktop app, add `http://localhost:34115` to `PASSKEY_RP_ORIGINS` on prod, or don't rely on passkey in the desktop build.
- **macOS signing/notarization** omitted for internal use (right-click → Open on first launch). Add signing config later for wider distribution.
