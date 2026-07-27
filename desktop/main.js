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
