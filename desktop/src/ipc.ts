import type { Invoke } from "./ipc-contract";
import { sameOrigin } from "./links";
import type { OfflineSaver } from "./offline";
import type { SettingsFile } from "./settings";
import type { Store } from "./store";
import { isLimit, isSlug } from "./validate";

export type Handlers = { [C in keyof Invoke]: (...args: Invoke[C]["args"]) => Promise<Invoke[C]["result"]> };

/** The slice of IpcMainInvokeEvent the gate reads — a plain shape so a test can build one. */
export type IpcEventLike = { senderFrame: { url: string; parent: unknown; detached: boolean } | null };

/** Only the upstream's top-level page. A same-origin iframe — pdf.js rendering a user's upload — gets nothing. */
export function senderAllowed(frameUrl: string | undefined, isMainFrame: boolean, origin: string): boolean {
  return isMainFrame && frameUrl !== undefined && sameOrigin(frameUrl, origin);
}

export function buildHandlers(d: {
  saver: Pick<OfflineSaver, "list" | "save" | "cancel" | "remove">;
  store: Store;
  settings: SettingsFile;
  connectivity: () => boolean;
}): Handlers {
  const user = () => d.settings.value.userId;
  return {
    "offline:list": () => d.saver.list(),
    // Not awaited: progress arrives as offline:progress events.
    "offline:save": async (slug) => void d.saver.save(slug),
    "offline:cancel": async (slug) => d.saver.cancel(slug),
    "offline:remove": (slug) => d.saver.remove(slug),
    "storage:usage": async () => {
      const u = user();
      const { used, pinned } = u ? await d.store.usage(u) : { used: 0, pinned: 0 };
      return { used, pinned, limit: d.settings.value.limit };
    },
    "storage:set-limit": async (bytes) => {
      await d.settings.update({ limit: bytes });
      const u = user();
      if (u) await d.store.evict(u, bytes);
    },
    "storage:clear": async () => {
      const u = user();
      if (u) await d.store.evict(u, 0);
    },
    "connectivity:get": async () => d.connectivity(),
  };
}

const ARGS: { [C in keyof Invoke]: (args: unknown[]) => boolean } = {
  "offline:list": (a) => a.length === 0,
  "offline:save": (a) => a.length === 1 && isSlug(a[0]),
  "offline:cancel": (a) => a.length === 1 && isSlug(a[0]),
  "offline:remove": (a) => a.length === 1 && isSlug(a[0]),
  "storage:usage": (a) => a.length === 0,
  "storage:set-limit": (a) => a.length === 1 && isLimit(a[0]),
  "storage:clear": (a) => a.length === 0,
  "connectivity:get": (a) => a.length === 0,
};

export function registerIpc(
  ipc: { handle(channel: string, fn: (event: IpcEventLike, ...args: unknown[]) => unknown): void },
  origin: string,
  handlers: Handlers,
): void {
  for (const channel of Object.keys(ARGS) as (keyof Invoke)[]) {
    ipc.handle(channel, async (event, ...args) => {
      const frame = event.senderFrame;
      if (!senderAllowed(frame?.url, frame !== null && frame.parent === null && !frame.detached, origin)) {
        throw new Error(`ipc: ${channel} refused for ${frame?.url ?? "a destroyed frame"}`);
      }
      if (!ARGS[channel](args)) throw new Error(`ipc: ${channel} refused its arguments`);
      return (handlers[channel] as (...a: unknown[]) => Promise<unknown>)(...args);
    });
  }
}
