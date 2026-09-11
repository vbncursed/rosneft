import type { Chain } from "@/entities/measurement";
import type { ResolvedPlacement } from "@/entities/placement";
import type { ModelOption, SceneViewModel } from "@/entities/scene";
import type { Tour } from "@/features/onboarding";
import { VIEWER_TOUR_STEPS } from "@/features/onboarding";
import { CatalogShell } from "@/widgets/catalog-shell";
import { pageProps, type PageHandlers, type PageParts } from "./model/page-props";
import type { Grants } from "./model/viewer-view";
import { TerritoryViewerPage } from "./ui/territory-viewer-page";
import { ViewerLoading } from "./ui/territory-viewer-screen";

const noop = () => {};
// One shared no-op set: a fixture never fires anything, and twenty-five named
// stubs would be twenty-five lines saying the same thing.
const ON = new Proxy({} as PageHandlers, { get: () => noop });

const OWNER: Grants = { create: true, write: true, delete: true, replace: true };
const GUEST: Grants = { create: false, write: false, delete: false, replace: false };
const NO_DELETE: Grants = { create: true, write: true, delete: false, replace: true };

const at = (id: number, modelSlug: string, x: number): ResolvedPlacement => ({
  id,
  territorySlug: "refinery-block-c",
  modelSlug,
  label: "",
  updatedAt: "2026-09-09T14:00:00Z",
  visiblePanoramaIds: [],
  position: { x, y: 0, z: -8.25 },
  rotation: { x: 0, y: Math.PI / 2, z: 0 },
  scale: { x: 1, y: 1, z: 1 },
  chain: [],
});

const PLACEMENTS = [
  at(1, "storage-tank-500", 12.4),
  at(2, "storage-tank-500", 18.2),
  at(3, "storage-tank-500", 24),
  at(4, "valve-assembly", 6.1),
];

const OPTIONS: ModelOption[] = [
  { slug: "storage-tank-500", title: "storage-tank-500", chain: [{ lod: 0, hash: "m0", size: 8_800_000 }] },
  { slug: "valve-assembly", title: "valve-assembly", chain: [{ lod: 0, hash: "m1", size: 2_100_000 }] },
];

const VM: SceneViewModel = {
  parentLods: [
    { lod: 0, hash: "h0", size: 10_276_000 },
    { lod: 1, hash: "h1", size: 5_100_000 },
    { lod: 2, hash: "h2", size: 2_400_000 },
  ],
  metadata: {
    dims: { x: 36, y: 24, z: 8.5 },
    units: "metres",
    vertices: 1_284_210,
    faces: 612_480,
    uploadedAt: "2026-09-04T09:00:00Z",
  },
  placements: PLACEMENTS,
};

const CHAINS: Chain[] = [
  { id: 1, points: [{ x: -0.4, y: 0.1, z: 0.2 }, { x: 0.3, y: 0.1, z: 0.2 }], closed: false },
  { id: 2, points: [{ x: 0.1, y: 0.1, z: -0.5 }, { x: 0.1, y: 0.1, z: 0.1 }], closed: false },
];

const IDLE_TOUR: Tour = {
  active: false,
  step: null,
  stepIndex: 0,
  total: VIEWER_TOUR_STEPS.length,
  isLast: false,
  next: noop,
  prev: noop,
  skip: noop,
  restart: noop,
};

const base = (): PageParts => ({
  slug: "refinery-block-c",
  title: "Refinery Block C",
  grants: OWNER,
  vm: VM,
  options: OPTIONS,
  mode: { mode: "orbit", selectedId: null, gizmo: "translate", snap: false },
  measure: { chains: [], activeChainId: null, summary: { segments: 0, total: "0.00 m" } },
  placements: PLACEMENTS,
  pendingIds: [],
  placing: null,
  form: null,
  tour: IDLE_TOUR,
  panel: { tab: "placements", collapsed: false },
  view: {
    report: { shown: 1, target: 1, percent: null, progressText: null, failure: null },
    targetLod: 1,
    retryVersion: 0,
    resetVersion: 0,
    focusRequest: null,
    pickerOpen: false,
    query: "",
    expandedModel: "storage-tank-500",
    compact: false,
    error: null,
    now: new Date(2026, 8, 9, 14, 22),
  },
  on: ON,
});

/** A whole page from one set of overrides — every state below is one call. */
export const viewerState = (edit: (p: PageParts) => PageParts = (p) => p) =>
  pageProps(edit(base()));

const page = (edit?: (p: PageParts) => PageParts) => (
  <CatalogShell layout="viewport">
    <TerritoryViewerPage {...viewerState(edit)} />
  </CatalogShell>
);

const selected = (p: PageParts): PageParts => ({
  ...p,
  mode: { ...p.mode, selectedId: 2 },
});

export default {
  "1 collapsed": page((p) => ({ ...p, panel: { tab: "placements", collapsed: true } })),

  "2 selected translate": page(selected),

  "3 loading": page((p) => ({
    ...p,
    panel: { tab: "view", collapsed: false },
    view: {
      ...p.view,
      targetLod: 0,
      report: { shown: 2, target: 0, percent: 62, progressText: "6.1 / 9.8 MB", failure: null },
    },
  })),

  "4 measuring": page((p) => ({
    ...p,
    mode: { ...p.mode, mode: "measure" },
    panel: { tab: "view", collapsed: false },
    measure: { chains: CHAINS, activeChainId: 2, summary: { segments: 2, total: "20.55 m" } },
  })),

  "5 guest": page((p) => ({ ...p, grants: GUEST })),

  "6 error": page((p) => ({
    ...p,
    view: {
      ...p.view,
      report: { shown: null, target: 1, percent: null, progressText: null, failure: { hash: "h1", status: 502 } },
      error: { lod: 1, status: 502, file: "refinery-block-c-lod1.glb", coarser: { lod: 2, hash: "h2", size: 2_400_000 } },
    },
  })),

  "7 empty": page((p) => ({ ...p, placements: [], vm: { ...VM, placements: [] } })),

  "13 write, no delete": page((p) => ({ ...selected(p), grants: NO_DELETE })),

  "14 create form, saving": page((p) => ({
    ...selected(p),
    form: {
      kind: "new",
      label: "Tank 4, north row",
      onLabel: noop,
      transform: { position: { x: 18.2, y: 0, z: -4.05 }, rotation: { x: 0, y: Math.PI / 4, z: 0 }, scale: { x: 1, y: 1, z: 1 } },
      onTransform: noop,
      saving: true,
      onSave: noop,
      onCancel: noop,
    },
  })),

  "15 tour step 3": page((p) => ({
    ...p,
    tour: { ...IDLE_TOUR, active: true, step: VIEWER_TOUR_STEPS[2], stepIndex: 2 },
  })),

  "16 loading interface": (
    <CatalogShell layout="viewport">
      <ViewerLoading />
    </CatalogShell>
  ),

  "17 compact 1280": (
    <div className="w-[1280px] max-w-full">
      {page((p) => ({ ...selected(p), view: { ...p.view, compact: true, targetLod: 0 } }))}
    </div>
  ),
};
