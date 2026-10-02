import { useEffect, useSyncExternalStore } from "react";
import { messageOf } from "@/shared/api";
import { desktopBridge, type OfflineProgress, type SavedTerritory } from "@/shared/lib/desktop";
import { notify } from "@/shared/lib/notify";

type State = {
  saved: ReadonlyMap<string, SavedTerritory>;
  progress: ReadonlyMap<string, OfflineProgress>;
  /** False until the shell has answered `list()` once — an empty `saved` before that means "not known yet". */
  loaded: boolean;
};
const EMPTY: State = { saved: new Map(), progress: new Map(), loaded: false };

// Module-level: one subscription to the shell, shared by every card and section.
let state: State = EMPTY;
let wired = false;
const listeners = new Set<() => void>();
const set = (next: State) => {
  state = next;
  listeners.forEach((l) => l());
};

// Newest read wins: a list that answers after the account changed belongs to the old one.
let reads = 0;
// The account the list on screen belongs to. Module-level so a shell remount keeps it.
let owner: string | null = null;

async function reload(): Promise<void> {
  const mine = ++reads;
  const list = await desktopBridge()?.offline.list();
  if (list && mine === reads) set({ ...state, saved: new Map(list.map((t) => [t.slug, t])), loaded: true });
}

/** The shell lists the signed-in user's copies only on request: call when that user is known or changes. A new one empties the list first, so the last user's titles never show. */
export function syncOfflineUser(userId: string | undefined): void {
  if (!userId || userId === owner) return;
  owner = userId;
  set(EMPTY);
  void reload().catch(() => undefined);
}

/** Runs `syncOfflineUser` for the signed-in user; mount it once in every shell. */
export function useOfflineUser(userId: string | undefined): void {
  useEffect(() => syncOfflineUser(userId), [userId]);
}

function wire(): void {
  const bridge = desktopBridge();
  if (wired || !bridge) return;
  wired = true;
  void reload().catch(() => undefined);
  bridge.offline.onProgress((p) => {
    const progress = new Map(state.progress);
    if (p.state === "saved" || p.state === "cancelled" || p.state === "gone") progress.delete(p.slug);
    else progress.set(p.slug, p);
    // The title is read before the reload drops it.
    if (p.state === "gone")
      notify.warning(
        `\u201c${state.saved.get(p.slug)?.title ?? p.slug}\u201d is no longer available and was removed from this device`,
      );
    set({ ...state, progress });
    if (p.state === "saved" || p.state === "failed" || p.state === "cancelled" || p.state === "gone")
      void reload().catch(() => undefined);
  });
}

function subscribe(listener: () => void): () => void {
  wire();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const useOfflineState = (): State =>
  useSyncExternalStore(
    subscribe,
    () => state,
    () => EMPTY,
  );

export function useOfflineTerritory(slug: string): { saved?: SavedTerritory; progress?: OfflineProgress } {
  const s = useOfflineState();
  return { saved: s.saved.get(slug), progress: s.progress.get(slug) };
}

export const useSavedTerritories = (): SavedTerritory[] => [...useOfflineState().saved.values()];

export const offlineActions = {
  // An IPC rejection (shell restarting, handler threw) must not surface as an unhandled rejection.
  save: (slug: string): void =>
    void desktopBridge()
      ?.offline.save(slug)
      .catch(() => undefined),
  cancel: (slug: string): void =>
    void desktopBridge()
      ?.offline.cancel(slug)
      .catch(() => undefined),
  remove: async (slug: string): Promise<void> => {
    // The one place a refused removal is reported (viewer and Storage section alike).
    await desktopBridge()
      ?.offline.remove(slug)
      .catch((err: unknown) => notify.error(`Could not remove the territory from this device: ${messageOf(err)}`));
    await reload().catch(() => undefined);
  },
};

/** Test seam: forget the shell so the next subscriber wires up afresh. */
export function resetOfflineStore(): void {
  state = EMPTY;
  owner = null;
  reads = 0;
  wired = false;
  listeners.clear();
}
