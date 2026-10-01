import { useCallback, useEffect, useState } from "react";
import { offlineActions, useOfflineState, useSavedTerritories } from "@/features/offline-save";
import { messageOf } from "@/shared/api";
import { desktopBridge, type StorageUsage } from "@/shared/lib/desktop";
import { notify } from "@/shared/lib/notify";

/**
 * The Storage section's container: usage from the shell, re-read whenever the
 * saved list or a setting changes. `usage` null is "not answered yet" until
 * `usageFailed` says the shell refused (a corrupt pins.json rejects) — the
 * two read differently on screen.
 */
export function useDeviceStorage() {
  const saved = useSavedTerritories();
  const { loaded: savedLoaded } = useOfflineState();
  const [usage, setUsage] = useState<StorageUsage | null>(null);
  const [usageFailed, setUsageFailed] = useState(false);
  const refresh = useCallback(() => {
    void desktopBridge()
      ?.storage.usage()
      .then(
        (u) => {
          setUsage(u);
          setUsageFailed(false);
        },
        () => {
          setUsage(null);
          setUsageFailed(true);
        },
      );
  }, []);
  const savedKey = saved.map((t) => `${t.slug}:${t.syncedAt}`).join("|");
  useEffect(refresh, [refresh, savedKey]);

  // A refused write is a toast, never a throw out of a click handler.
  const act = (what: string, run: () => Promise<void> | undefined) => async () => {
    try {
      await run();
    } catch (err) {
      notify.error(`Could not ${what}: ${messageOf(err)}`);
    }
    refresh();
  };

  return {
    usage,
    usageFailed,
    saved,
    savedLoaded,
    setLimit: (bytes: number) => act("change the storage limit", () => desktopBridge()?.storage.setLimit(bytes))(),
    clear: act("clear the cache", () => desktopBridge()?.storage.clearCache()),
    remove: (slug: string) => act("remove the territory", () => offlineActions.remove(slug))(),
  };
}
