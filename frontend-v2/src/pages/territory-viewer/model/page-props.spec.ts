import { describe, expect, it, vi } from "vitest";
import type { ResolvedPlacement } from "@/entities/placement";
import type { ModelOption, SceneViewModel } from "@/entities/scene";
import type { Tour } from "@/features/onboarding";
import { pageProps, type PageHandlers, type PageParts } from "./page-props";
import type { Grants } from "./viewer-view";

const OWNER: Grants = { create: true, write: true, delete: true, replace: true };
const GUEST: Grants = { create: false, write: false, delete: false, replace: false };

const TANK: ResolvedPlacement = {
  id: 4,
  territorySlug: "refinery-block-c",
  modelSlug: "storage-tank-500",
  label: "",
  updatedAt: "2026-09-09T14:00:00Z",
  visiblePanoramaIds: [],
  position: { x: 12.4, y: 0, z: -8.25 },
  rotation: { x: 0, y: 0, z: 0 },
  scale: { x: 1, y: 1, z: 1 },
  chain: [],
};

const OPTIONS: ModelOption[] = [
  { slug: "storage-tank-500", title: "storage-tank-500", chain: [{ lod: 0, hash: "m0", size: 1 }] },
];

const VM: SceneViewModel = {
  parentLods: [
    { lod: 0, hash: "h0", size: 9 },
    { lod: 1, hash: "h1", size: 5 },
    { lod: 2, hash: "h2", size: 2 },
  ],
  metadata: {
    dims: { x: 36, y: 24, z: 8.5 },
    units: "metres",
    vertices: 1_284_210,
    faces: 612_480,
    uploadedAt: "2026-09-04T09:00:00Z",
  },
  placements: [TANK],
  panoramas: [],
  documents: [],
  sourceBbox: null,
};

const TOUR: Tour = {
  active: false,
  step: null,
  stepIndex: 0,
  total: 8,
  isLast: false,
  next: vi.fn(),
  prev: vi.fn(),
  skip: vi.fn(),
  restart: vi.fn(),
};

const noop = () => {};

const HANDLERS: PageHandlers = {
  onPick: noop,
  onTransformCommit: noop,
  onMeasurePoint: noop,
  onCloseActiveChain: noop,
  onRemoveSegment: noop,
  onRemoveChain: noop,
  onLod: noop,
  onReset: noop,
  onMeasure: noop,
  onAdd: noop,
  onReplayTour: noop,
  onTargetLod: vi.fn(),
  onRetry: noop,
  onClearMeasurements: noop,
  onTab: noop,
  onCollapsed: noop,
  onQuery: noop,
  onToggleGroup: noop,
  onSelect: noop,
  onRename: noop,
  onDelete: noop,
  onFocus: noop,
  onGizmo: noop,
  onSnap: noop,
  onPlace: noop,
  onClosePicker: noop,
};

const parts = (over: Partial<PageParts> = {}): PageParts => ({
  slug: "refinery-block-c",
  title: "Refinery Block C",
  grants: OWNER,
  vm: VM,
  options: OPTIONS,
  mode: { mode: "orbit", selectedId: null, gizmo: "translate", snap: false },
  measure: { chains: [], activeChainId: null, summary: { segments: 0, total: "0.00 m" } },
  placements: [TANK],
  pendingIds: [],
  placing: null,
  form: null,
  tour: TOUR,
  panel: { tab: "view", collapsed: false },
  view: {
    report: { shown: 1, target: 1, percent: null, progressText: null, failure: null },
    targetLod: 1,
    retryVersion: 0,
    resetVersion: 0,
    focusRequest: null,
    pickerOpen: false,
    query: "",
    expandedModel: null,
    compact: false,
    error: null,
    now: new Date(2026, 8, 9, 14, 22),
  },
  on: HANDLERS,
  ...over,
});

const FAILURE = {
  view: {
    ...parts().view,
    report: { shown: null, target: 1, percent: null, progressText: null, failure: { hash: "h1", status: 502 } },
    error: { lod: 1, status: 502, file: "refinery-block-c-lod1.glb", coarser: { lod: 2, hash: "h2", size: 2 } },
  },
};

describe("pageProps · header", () => {
  it("names the territory and reports it ready", () => {
    const { header } = pageProps(parts());
    expect(header.title).toBe("Refinery Block C");
    expect(header.pills).toEqual([{ tone: "ok", label: "ready" }]);
  });

  it("prints the slug, the chain length and the units under the title", () => {
    expect(pageProps(parts()).header.meta).toBe("refinery-block-c · 3 LODs · metres");
  });

  it("drops the meta line while measuring — the mock gives the pills the room", () => {
    const p = parts();
    expect(pageProps({ ...p, mode: { ...p.mode, mode: "measure" } }).header.meta).toBeNull();
  });

  it("drops the meta line and offers no replace link to a guest", () => {
    const { header } = pageProps(parts({ grants: GUEST }));
    expect(header.guest).toBe(true);
    expect(header.canReplace).toBe(false);
    expect(header.meta).toBeNull();
  });

  it("offers the replace link to a reader who may write the territory", () => {
    expect(pageProps(parts()).header.canReplace).toBe(true);
  });
});

describe("pageProps · canvas", () => {
  it("hands the canvas the chain, the level asked for and the mode", () => {
    const { canvas } = pageProps(parts());
    expect(canvas.parentLods).toBe(VM.parentLods);
    expect(canvas.targetLod).toBe(1);
    expect(canvas.mode).toBe("orbit");
    expect(canvas.canWrite).toBe(true);
  });

  it("derives the measure tool's unit ratio from the territory's own bbox", () => {
    expect(pageProps(parts()).canvas.unitRatio).toBe(18);
  });

  it("passes the selection, the gizmo and the versions straight through", () => {
    const p = parts({ mode: { mode: "orbit", selectedId: 4, gizmo: "rotate", snap: true } });
    const { canvas } = pageProps({ ...p, view: { ...p.view, retryVersion: 3, focusRequest: [4] } });
    expect(canvas.selectedId).toBe(4);
    expect(canvas.gizmo).toBe("rotate");
    expect(canvas.snap).toBe(true);
    expect(canvas.retryVersion).toBe(3);
    expect(canvas.focusRequest).toEqual([4]);
  });
});

describe("pageProps · overlays", () => {
  it("lights Reset and offers every tool an owner has", () => {
    expect(pageProps(parts()).overlays.tools).toEqual([
      { key: "reset", state: "active" },
      { key: "measure", state: "idle" },
      { key: "add", state: "idle" },
      { key: "tour", state: "idle" },
    ]);
  });

  it("hides the meta and lights no tile while the tour runs", () => {
    // Spec §4: `guided tour` (accent) replaces the meta, and the mock draws the
    // whole rail idle — the tour is explaining the controls, not using them.
    const props = pageProps(parts({ tour: { ...TOUR, active: true } }));
    expect(props.header.meta).toBeNull();
    expect(props.header.pills).toContainEqual({ tone: "accent", label: "guided tour" });
    expect(props.overlays.tools.every((t) => t.state === "idle")).toBe(true);
  });

  it("says what the pointer does", () => {
    expect(pageProps(parts()).overlays.chip).toEqual({ text: "orbit · drag to rotate" });
  });

  it("prints the level on screen in the strip", () => {
    expect(pageProps(parts()).overlays.strip).toEqual({
      items: ["36.0 × 24.0 × 8.5 m", "1 284 210 vertices", "612 480 faces", "LOD 1 active"],
      tone: "neutral",
      accentLast: false,
    });
  });

  it("offers every converted level in the switcher, coarsest last", () => {
    expect(pageProps(parts()).overlays.switcher).toMatchObject({
      levels: [0, 1, 2],
      target: 1,
      shown: 1,
    });
  });

  it("draws no switcher for a territory with a single level", () => {
    const p = parts();
    const one = { ...VM, parentLods: [VM.parentLods[0]] };
    expect(pageProps({ ...p, vm: one }).overlays.switcher).toBeNull();
  });

  it("swaps the mode chip for the two loading chips while the target downloads", () => {
    const p = parts();
    const { overlays } = pageProps({
      ...p,
      view: {
        ...p.view,
        targetLod: 0,
        report: { shown: 2, target: 0, percent: 62, progressText: "6.1 / 9.8 MB", failure: null },
      },
    });
    expect(overlays.chip).toBeNull();
    expect(overlays.loading).toEqual({
      chip: "coarse LOD 2 shown · LOD 0 62% · 6.1 / 9.8 MB",
      percent: 62,
      target: 0,
    });
    expect(overlays.strip.accentLast).toBe(true);
  });

  it("shows the keycap hints only with the panel folded away and the pointer orbiting", () => {
    expect(pageProps(parts()).overlays.hints).toBe(false);
    expect(pageProps(parts({ panel: { tab: "view", collapsed: true } })).overlays.hints).toBe(true);
  });

  it("offers Clear and Close only in measure mode, and Close only with a chain open", () => {
    const p = parts();
    expect(pageProps(p).overlays.measuring).toBeNull();
    const measuring = pageProps({
      ...p,
      mode: { ...p.mode, mode: "measure" },
      measure: { chains: [], activeChainId: null, summary: { segments: 0, total: "0.00 m" } },
    }).overlays.measuring;
    expect(measuring).toMatchObject({ canClear: false, canClose: false });
  });

  it("counts the measured segments on the chip", () => {
    const p = parts();
    const { overlays } = pageProps({
      ...p,
      mode: { ...p.mode, mode: "measure" },
      measure: { chains: [], activeChainId: 1, summary: { segments: 2, total: "20.55 m" } },
    });
    expect(overlays.chip).toEqual({ text: "measure · 2 segments · 20.55 m total" });
    expect(overlays.measuring).toMatchObject({ canClose: true });
  });
});

describe("pageProps · a failed mesh", () => {
  it("replaces the ready pill and states the absence in the strip", () => {
    const { header, overlays } = pageProps(parts(FAILURE));
    expect(header.pills[0]).toEqual({ tone: "bad", label: "artifact unavailable" });
    expect(overlays.strip.tone).toBe("bad");
    expect(overlays.strip.items).toContain("LOD 1 requested");
  });

  it("makes every tool inert, drops the switcher and drops the panel", () => {
    const props = pageProps(parts(FAILURE));
    expect(props.overlays.tools.every((t) => t.state === "inert")).toBe(true);
    expect(props.overlays.switcher).toBeNull();
    expect(props.panel).toBeNull();
  });

  it("builds the card's words from the failure the canvas reported", () => {
    const { error } = pageProps(parts(FAILURE)).overlays;
    expect(error?.copy.body).toContain("Storage returned 502 for the LOD 1 mesh.");
    expect(error?.copy.footer).toBe("refinery-block-c-lod1.glb · last attempt 14:22");
  });

  it("asks for the coarser level when the reader takes the way out, and retries with it", () => {
    const onTargetLod = vi.fn();
    const onRetry = vi.fn();
    const p = parts(FAILURE);
    const { error } = pageProps({ ...p, on: { ...HANDLERS, onTargetLod, onRetry } }).overlays;
    error?.onCoarse?.();
    expect(onTargetLod).toHaveBeenCalledWith(2);
    // The failure is cleared by the retry alone; without this the target moved
    // and the card stayed, which is a drawn button that answers nothing.
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("offers no way out when there is no coarser level, and says so in the copy", () => {
    const p = parts(FAILURE);
    const alone = { ...p.view, error: { ...p.view.error!, coarser: null } };
    const { error } = pageProps({ ...p, view: alone }).overlays;
    expect(error?.onCoarse).toBeNull();
    expect(error?.copy.coarseLabel).toBeNull();
  });

  it("shows no chip at all — there is no scene to say anything about", () => {
    expect(pageProps(parts(FAILURE)).overlays.chip).toBeNull();
  });
});

describe("pageProps · panel", () => {
  it("groups the placements by model and counts them for the tab", () => {
    const { panel } = pageProps(parts());
    expect(panel?.placementsCount).toBe(1);
    expect(panel?.placements.groups[0].model.title).toBe("storage-tank-500");
  });

  it("prints the territory's facts on the View tab, the slug in the accent", () => {
    const { panel } = pageProps(parts());
    expect(panel?.details).toEqual([
      { label: "slug", value: "refinery-block-c", tone: "accent" },
      { label: "units", value: "metres" },
      { label: "vertices", value: "1 284 210" },
      { label: "faces", value: "612 480" },
      { label: "uploaded", value: "4 Sep 2026", tone: "muted" },
    ]);
  });

  it("draws no selected block until something is selected", () => {
    expect(pageProps(parts()).panel?.placements.selected).toBeNull();
  });

  it("names the selected instance the way the list does", () => {
    const p = parts({ mode: { mode: "orbit", selectedId: 4, gizmo: "translate", snap: false } });
    expect(pageProps(p).panel?.placements.selected).toMatchObject({
      name: "storage-tank-500 #1",
      transform: { position: TANK.position },
      canWrite: true,
      compact: false,
    });
  });

  it("passes the compact flag down so the gizmo keys lose their brackets at 1280", () => {
    const p = parts({ mode: { mode: "orbit", selectedId: 4, gizmo: "translate", snap: false } });
    const compact = pageProps({ ...p, view: { ...p.view, compact: true } });
    expect(compact.panel?.placements.selected?.compact).toBe(true);
  });

  it("hands the open form to the selected block", () => {
    const form = {
      kind: "new" as const,
      label: "Tank 4",
      onLabel: noop,
      transform: TANK,
      onTransform: noop,
      saving: false,
      onSave: noop,
      onCancel: noop,
    };
    const p = parts({ form, mode: { mode: "orbit", selectedId: 4, gizmo: "translate", snap: false } });
    expect(pageProps(p).panel?.placements.selected?.form).toBe(form);
  });

  it("passes a guest's grants through to the list, which draws Focus instead of the actions", () => {
    const { panel } = pageProps(parts({ grants: GUEST }));
    expect(panel?.placements.grants).toEqual({ create: false, write: false, delete: false });
  });
});

describe("pageProps · picker, tour and the loading gate", () => {
  it("names the territory in the picker and reports the batch's progress", () => {
    const { picker } = pageProps(parts({ placing: { done: 1, total: 2 } }));
    expect(picker.territoryTitle).toBe("Refinery Block C");
    expect(picker.options).toBe(OPTIONS);
    expect(picker.placing).toEqual({ done: 1, total: 2 });
    expect(picker.open).toBe(false);
  });

  it("hands the tour straight through", () => {
    expect(pageProps(parts()).tour).toBe(TOUR);
  });

  it("is loading only while nothing is on screen and nothing has failed", () => {
    const p = parts();
    expect(pageProps(p).loadingScene).toBe(false);
    const nothing = { ...p.view, report: { ...p.view.report, shown: null } };
    expect(pageProps({ ...p, view: nothing }).loadingScene).toBe(true);
    expect(pageProps(parts(FAILURE)).loadingScene).toBe(false);
  });
});
