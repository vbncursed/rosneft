// Mirrors desktop/src/ipc-contract.ts — two packages, no shared build; change both together.
// OfflineProgress and StorageUsage are the contract's `Progress` and `Usage` under SPA names.

export type SavedTerritory = { slug: string; title: string; bytes: number; savedAt: string; syncedAt: string };
export type SaveState = "queued" | "saving" | "saved" | "failed" | "cancelled" | "gone";
export type SaveError = "network" | "no-space" | "signed-out" | "failed";
export type OfflineProgress = { slug: string; state: SaveState; done: number; total: number; error?: SaveError };
export type StorageUsage = { used: number; pinned: number; limit: number };

export type DesktopBridge = {
  /** Whether a passkey ceremony works on this OS inside the shell. */
  passkeys: boolean;
  onConnectivity(cb: (online: boolean) => void): () => void;
  offline: {
    list(): Promise<SavedTerritory[]>;
    save(slug: string): Promise<void>;
    cancel(slug: string): Promise<void>;
    remove(slug: string): Promise<void>;
    onProgress(cb: (p: OfflineProgress) => void): () => void;
  };
  storage: {
    usage(): Promise<StorageUsage>;
    setLimit(bytes: number): Promise<void>;
    clearCache(): Promise<void>;
  };
};

declare global {
  interface Window {
    /** Exposed by the Electron shell's preload (desktop/src/preload.ts). Absent in a browser. */
    desktop?: DesktopBridge;
  }
}

export const desktopBridge = (): DesktopBridge | undefined =>
  typeof window === "undefined" ? undefined : window.desktop;
