import type { OfflineProgress, SavedTerritory, SaveError } from "@/shared/lib/desktop";
import { formatBytes } from "@/shared/lib/format-bytes";

export type OfflineView =
  | { kind: "idle"; label: string }
  | { kind: "saving"; label: string; percent: number | null }
  | { kind: "saved"; label: string }
  | { kind: "failed"; label: string }
  | { kind: "offline"; label: string };

const REASON: Record<SaveError, string> = {
  network: "the connection dropped",
  "no-space": "not enough disk space",
  "signed-out": "you are signed out",
  failed: "the download failed",
};

/** What the offline control says — always in words, never colour alone. */
export function offlineView(saved?: SavedTerritory, progress?: OfflineProgress, online = true): OfflineView {
  if (progress?.state === "queued") return { kind: "saving", label: "Waiting to save…", percent: null };
  if (progress?.state === "saving") {
    const percent = progress.total ? Math.floor((progress.done / progress.total) * 100) : 0;
    return { kind: "saving", label: `Saving… ${percent}%`, percent };
  }
  // A save needs the network: offer none that would fail. A saved territory and a running save are unaffected.
  if (!online && !saved) return { kind: "offline", label: "Reconnect to save" };
  // A saved copy outranks a failed attempt: a failed resync leaves it intact.
  if (saved) return { kind: "saved", label: `Available offline · ${formatBytes(saved.bytes)}` };
  if (progress?.state === "failed") return { kind: "failed", label: `Couldn't save — ${REASON[progress.error ?? "failed"]}` };
  return { kind: "idle", label: "Save offline" };
}
