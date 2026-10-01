import { app, BrowserWindow, shell } from "electron";
import { upstreamOrigin } from "./config";
import { openableExternally, sameOrigin } from "./links";

const ORIGIN = upstreamOrigin(process.env);
const PARTITION = "persist:andrey";

// A build pointed somewhere else keeps its own profile: it never shares — or
// locks — the installed app's cookie, cache or single-instance lock.
if (process.env.DESKTOP_UPSTREAM) app.setPath("userData", `${app.getPath("userData")}-dev`);

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    title: "Andrey",
    webPreferences: { partition: PARTITION, contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!sameOrigin(url, ORIGIN) && openableExternally(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, url) => {
    if (sameOrigin(url, ORIGIN)) return;
    event.preventDefault();
    if (openableExternally(url)) void shell.openExternal(url);
  });
  void win.loadURL(ORIGIN);
  return win;
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const [win] = BrowserWindow.getAllWindows();
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });
  app.on("window-all-closed", () => app.quit());
  void app.whenReady().then(createWindow);
}
