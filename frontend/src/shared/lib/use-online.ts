import { useSyncExternalStore } from "react";
import { desktopBridge } from "./desktop";

// Module-level: one subscription to the shell for the whole app. The shell
// delivers the current state once, then every change; "online" until told otherwise.
let online = true;
let wired = false;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!wired) {
    wired = true;
    desktopBridge()?.onConnectivity((value) => {
      online = value;
      listeners.forEach((l) => l());
    });
  }
  return () => {
    listeners.delete(listener);
  };
}

/** False only inside the desktop shell, after its last request could not reach the network. */
export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => online,
    () => true,
  );
}
