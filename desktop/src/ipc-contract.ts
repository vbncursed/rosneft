// Types only — erased by tsc, so the sandboxed preload can import it and stay one
// file. The frontend mirrors these in frontend/src/shared/lib/desktop.ts: two
// packages with no shared build, so a change here is a change there.

export type SavedTerritory = { slug: string; title: string; bytes: number; savedAt: string; syncedAt: string };
export type SaveState = "queued" | "saving" | "saved" | "failed" | "cancelled";
export type SaveError = "network" | "no-space" | "signed-out" | "failed";
export type Progress = { slug: string; state: SaveState; done: number; total: number; error?: SaveError };
export type Usage = { used: number; pinned: number; limit: number };

export type Invoke = {
  "offline:list": { args: []; result: SavedTerritory[] };
  "offline:save": { args: [slug: string]; result: void };
  "offline:cancel": { args: [slug: string]; result: void };
  "offline:remove": { args: [slug: string]; result: void };
  "storage:usage": { args: []; result: Usage };
  "storage:set-limit": { args: [bytes: number]; result: void };
  "storage:clear": { args: []; result: void };
};

export type Push = { "offline:progress": Progress; connectivity: boolean };
