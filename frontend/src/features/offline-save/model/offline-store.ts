import { useSyncExternalStore } from "react";
import { desktopBridge, type OfflineProgress, type SavedTerritory } from "@/shared/lib/desktop";

type State = { saved: ReadonlyMap<string, SavedTerritory>; progress: ReadonlyMap<string, OfflineProgress> };
const EMPTY: State = { saved: new Map(), progress: new Map() };

// Module-level: one subscription to the shell, shared by every card and section.
let state: State = EMPTY;
let wired = false;
const listeners = new Set<() => void>();
const set = (next: State) => {
  state = next;
  listeners.forEach((l) => l());
};

async function reload(): Promise<void> {
  const list = await desktopBridge()?.offline.list();
  if (list) set({ ...state, saved: new Map(list.map((t) => [t.slug, t])) });
}

function wire(): void {
  const bridge = desktopBridge();
  if (wired || !bridge) return;
  wired = true;
  void reload().catch(() => undefined);
  bridge.offline.onProgress((p) => {
    const progress = new Map(state.progress);
    if (p.state === "saved" || p.state === "cancelled") progress.delete(p.slug);
    else progress.set(p.slug, p);
    set({ ...state, progress });
    if (p.state === "saved" || p.state === "failed" || p.state === "cancelled") void reload().catch(() => undefined);
  });
}

function subscribe(listener: () => void): () => void {
  wire();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const useOfflineState = (): State => useSyncExternalStore(subscribe, () => state, () => EMPTY);

export function useOfflineTerritory(slug: string): { saved?: SavedTerritory; progress?: OfflineProgress } {
  const s = useOfflineState();
  return { saved: s.saved.get(slug), progress: s.progress.get(slug) };
}

export const useSavedTerritories = (): SavedTerritory[] => [...useOfflineState().saved.values()];

export const offlineActions = {
  save: (slug: string): void => void desktopBridge()?.offline.save(slug),
  cancel: (slug: string): void => void desktopBridge()?.offline.cancel(slug),
  remove: async (slug: string): Promise<void> => {
    await desktopBridge()?.offline.remove(slug);
    await reload();
  },
};

/** Test seam: forget the shell so the next subscriber wires up afresh. */
export function resetOfflineStore(): void {
  state = EMPTY;
  wired = false;
  listeners.clear();
}
