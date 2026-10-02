import path from "node:path";
import { app, BrowserWindow, dialog, ipcMain, net, safeStorage, session, shell } from "electron";
import { upstreamOrigin } from "./config";
import { createHandler } from "./intercept";
import { registerIpc, buildHandlers } from "./ipc";
import type { Push } from "./ipc-contract";
import { OfflineSaver } from "./offline";
import { SettingsFile } from "./settings";
import { Shell } from "./shell";
import { Store } from "./store";
import { createUpdateChecker, scheduleUpdateChecks } from "./updates";
import { attachPermissionPolicy, attachWindowPolicy } from "./window-policy";

const ORIGIN = upstreamOrigin(process.env);
const PARTITION = "persist:andrey";

// Off everywhere: app.configureWebAuthn({ touchID: { keychainAccessGroup } }) needs a
// keychain-access-groups entitlement, i.e. a Developer ID signature our builds lack.
const PASSKEYS: Partial<Record<NodeJS.Platform, boolean>> = { darwin: false, win32: false, linux: false };

// A build pointed elsewhere, and any unpackaged run, keeps its own profile. An unpackaged
// run has no fuses: it cannot read the installed app's encrypted cookie store and would
// write plaintext into it. Neither may share — or lock — the installed app's cookie,
// cache or single-instance lock.
if (process.env.DESKTOP_UPSTREAM || !app.isPackaged) app.setPath("userData", `${app.getPath("userData")}-dev`);

let win: BrowserWindow | null = null;
let online: boolean | null = null;
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
  attachWindowPolicy(w.webContents, ORIGIN, (url) => void shell.openExternal(url));
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
  attachPermissionPolicy(ses, ORIGIN);
  // ses.fetch, never net.fetch: that is the default session, without our cookie.
  // credentials: "include" — without it Electron blocks cookies both ways.
  const network = (input: Request | string, init: RequestInit = {}) =>
    ses.fetch(input, {
      ...init,
      bypassCustomProtocolHandlers: true,
      credentials: "include",
      ...(input instanceof Request && input.body ? { duplex: "half" } : {}),
    });

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
      network: (req, init) => network(req, init),
      store,
      shell: shellCache,
      onSessionReset: () => saver.cancelAll(),
      settings,
      connectivity: (now) => {
        online = now;
        send("connectivity", now);
        if (now) saver.resyncAll().catch((e: unknown) => console.warn("resync failed", e));
      },
    }),
  );
  registerIpc(ipcMain, ORIGIN, buildHandlers({ saver, store, settings, connectivity: () => online ?? true }));

  if (process.platform === "linux" && safeStorage.getSelectedStorageBackend() === "basic_text") {
    console.warn(
      "no keyring (libsecret/KWallet): the cookie encryption fuse falls back to a hard-coded key (basic_text), so the session cookie is obfuscated, not protected",
    );
  }

  win = createWindow(PASSKEYS[process.platform] ?? false);

  const check = createUpdateChecker({
    // net.fetch, not ses.fetch: GitHub is not the upstream, needs no session cookie, and net.fetch honours the system proxy.
    fetch: (url, init) => net.fetch(url, init),
    settings,
    showDialog: async (message, detail) => {
      const options = { message, detail, buttons: ["Download", "Later"], defaultId: 0, cancelId: 1 };
      return (await (win ? dialog.showMessageBox(win, options) : dialog.showMessageBox(options))).response;
    },
    openExternal: (url) => shell.openExternal(url),
    currentVersion: app.getVersion(),
  });
  scheduleUpdateChecks({ setTimeout, setInterval, check, packaged: app.isPackaged });
}

if (app.requestSingleInstanceLock()) {
  app.on("second-instance", () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });
  app.on("window-all-closed", () => app.quit());
  app
    .whenReady()
    .then(start)
    .catch((err: unknown) => {
      dialog.showErrorBox("Andrey could not start", String(err));
      app.exit(1);
    });
} else {
  app.quit();
}
