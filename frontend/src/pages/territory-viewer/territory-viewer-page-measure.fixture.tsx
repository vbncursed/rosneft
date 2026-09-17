import type { Chain } from "@/entities/measurement";
import type { PageParts } from "./model/page-props";
import { GUEST, page } from "./territory-viewer-page.fixture";

/**
 * The measure tool over saved chains (spec 2026-09-17): what a writer, a
 * reader and a failed save look like, and the Clear question. Every state is
 * one override of the package-A parts, so this draws the same page.
 */

const line = (id: number, z: number, over: Partial<Chain> = {}): Chain => ({
  id,
  points: [
    { x: -0.6, y: 0.1, z },
    { x: 0, y: 0.1, z },
    { x: 0.5, y: 0.1, z: z + 0.3 },
  ],
  closed: false,
  sync: "local",
  ...over,
});

const SAVED = [line(1, -0.5, { serverId: 11, sync: "saved" }), line(2, 0, { serverId: 12, sync: "saved" })];

const measuring = (chains: Chain[], unsaved: boolean) => (p: PageParts): PageParts => ({
  ...p,
  mode: { ...p.mode, mode: "measure" },
  panel: { tab: "view", collapsed: false },
  measure: {
    ...p.measure,
    chains,
    activeChainId: null,
    summary: { segments: chains.length * 2, total: `${(chains.length * 13.42).toFixed(2)} m`, unsaved },
  },
});

export default {
  "measure · saved": page(measuring(SAVED, false)),

  "measure · saving": page(measuring([...SAVED, line(3, 0.5, { sync: "saving" })], false)),

  // A reader: the saved chains are drawn without remove buttons, their own is local.
  "measure · reader, not saved": page((p) => ({
    ...measuring([...SAVED, line(3, 0.5)], true)(p),
    grants: GUEST,
  })),

  "measure · save failed": page(measuring([...SAVED, line(3, 0.5, { sync: "failed" })], true)),

  "measure · clear question": page((p) => ({
    ...measuring([...SAVED, line(3, 0.5)], false)(p),
    view: { ...p.view, confirmClear: true },
  })),
};
