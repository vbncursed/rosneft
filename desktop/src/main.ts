import path from "node:path";
import { app, BrowserWindow, ipcMain, safeStorage, session, shell } from "electron";
import { upstreamOrigin } from "./config";
import { createHandler } from "./intercept";
import { registerIpc, buildHandlers } from "./ipc";
import type { Push } from "./ipc-contract";
import { openableExternally, sameOrigin } from "./links";
import { OfflineSaver } from "./offline";
import { SettingsFile } from "./settings";
import { Shell } from "./shell";
import { Store } from "./store";

const ORIGIN = upstreamOrigin(process.env);
const PARTITION = "persist:andrey";

// Off everywhere: app.configureWebAuthn({ touchID: { keychainAccessGroup } }) needs a
// keychain-access-groups entitlement, i.e. a Developer ID signature our builds lack.
const PASSKEYS: Partial<Record<NodeJS.Platform, boolean>> = { darwin: false, win32: false, linux: false };

if (process.env.DESKTOP_UPSTREAM) app.setPath("userData", `${app.getPath("userData")}-dev`);

let win: BrowserWindow | null = null;
const send = <C extends keyof Push>(channel: C, value: Push[C]) => win?.webContents.send(channel, value);

function createWindow(passkeysOn: boolean): BrowserWindow {
  const w = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    title: "Andrey",
    webPreferences: {
      partition: PARTITION,
      preload: path.join(__dirname, "preload.js"),
      additionalArguments: [`--andrey-origin=${ORIGIN}`, `--andrey-passkeys=${passkeysOn ? 1 : 0}`],
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  w.webContents.setWindowOpenHandler(({ url }) => {
    if (!sameOrigin(url, ORIGIN) && openableExternally(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  w.webContents.on("will-navigate", (event, url) => {
    if (sameOrigin(url, ORIGIN)) return;
    event.preventDefault();
    if (openableExternally(url)) void shell.openExternal(url);
  });
  w.on("closed", () => {
    win = null;
  });
  void w.loadURL(ORIGIN);
  return w;
}

async function start(): Promise<void> {
  const data = app.getPath("userData");
  const settings = new SettingsFile(path.join(data, "settings.json"));
  const store = new Store(path.join(data, "cache"));
  await store.init();

  const ses = session.fromPartition(PARTITION);
  // ses.fetch, never net.fetch: that is the default session, without our cookie.
  // credentials: "include" — without it Electron blocks cookies both ways.
  const network = (input: Request | string, init: RequestInit = {}) =>
    ses.fetch(input, {
      ...init,
      bypassCustomProtocolHandlers: true,
      credentials: "include",
      ...(input instanceof Request && input.body ? { duplex: "half" } : {}),
    } as RequestInit);

  const shellCache = new Shell(path.join(data, "cache", "shell"), ORIGIN, (url) => network(url, { cache: "no-store" }));
  const saver = new OfflineSaver({
    origin: ORIGIN,
    fetch: (url, signal) => network(url, { signal }),
    store,
    settings,
    emit: (p) => send("offline:progress", p),
  });

  ses.protocol.handle(
    new URL(ORIGIN).protocol.slice(0, -1),
    createHandler({
      origin: ORIGIN,
      network: (req) => network(req),
      store,
      shell: shellCache,
      settings,
      connectivity: (online) => {
        send("connectivity", online);
        if (online) void saver.resyncAll();
      },
    }),
  );
  registerIpc(ipcMain, ORIGIN, buildHandlers({ saver, store, settings }));

  if (process.platform === "linux" && safeStorage.getSelectedStorageBackend() === "basic_text") {
    console.warn("no keyring (libsecret/KWallet): the session cookie is stored with Chromium's basic encryption");
  }

  win = createWindow(PASSKEYS[process.platform] ?? false);
  void shellCache.refresh();
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });
  app.on("window-all-closed", () => app.quit());
  void app.whenReady().then(start);
}
