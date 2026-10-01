import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import type { Invoke, Push } from "./ipc-contract";

// Sandboxed preload: one file, `electron` the only runtime import. main.ts hands
// over what it decided through additionalArguments.
const arg = (name: string): string => process.argv.find((a) => a.startsWith(`--andrey-${name}=`))?.slice(`--andrey-${name}=`.length) ?? "";

const invoke = <C extends keyof Invoke>(channel: C, ...args: Invoke[C]["args"]): Promise<Invoke[C]["result"]> =>
  ipcRenderer.invoke(channel, ...args) as Promise<Invoke[C]["result"]>;

const listen = <C extends keyof Push>(channel: C, cb: (value: Push[C]) => void): (() => void) => {
  const handler = (_event: IpcRendererEvent, value: Push[C]) => cb(value);
  ipcRenderer.on(channel, handler);
  return () => {
    ipcRenderer.removeListener(channel, handler);
  };
};

if (location.origin === arg("origin") && window === window.top) {
  contextBridge.exposeInMainWorld("desktop", {
    passkeys: arg("passkeys") === "1",
    onConnectivity: (cb: (online: boolean) => void) => listen("connectivity", cb),
    offline: {
      list: () => invoke("offline:list"),
      save: (slug: string) => invoke("offline:save", slug),
      cancel: (slug: string) => invoke("offline:cancel", slug),
      remove: (slug: string) => invoke("offline:remove", slug),
      onProgress: (cb: (p: Push["offline:progress"]) => void) => listen("offline:progress", cb),
    },
    storage: {
      usage: () => invoke("storage:usage"),
      setLimit: (bytes: number) => invoke("storage:set-limit", bytes),
      clearCache: () => invoke("storage:clear"),
    },
  });
}
