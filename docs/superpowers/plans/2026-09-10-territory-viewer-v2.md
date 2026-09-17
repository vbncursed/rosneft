# Territory Viewer v2 (package A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `frontend-v2` renders the 3D viewer at `/territories/{slug}` for a
ready territory — the mock's top bar, the full-height scene with progressive
LOD and a switcher, the tool rail, the stats strip, the Overlays panel with
grouped placements and the gizmo, the measure tool, the guided tour, and the
guest, error, empty and loading states — and the old-SPA handoff ends.

**Architecture:** The old app's tested pure domains move verbatim into
`entities/scene`, `entities/measurement`, `entities/placement` and
`features/*`; its three.js layer moves as one widget
(`widgets/viewer-canvas`) with props in and callbacks out; seven new
`shared/ui` primitives carry the mock's overlay chrome; the panel, the
placements list, the picker modal and the tour are rebuilt on `shared/ui`;
one page slice (`pages/territory-viewer`) composes it; the route branches on
`sceneReady`.

**Tech Stack:** React 19 + TypeScript 7 + Tailwind 4 (Feature-Sliced),
TanStack Router/Query, three 0.186 + @react-three/fiber 9.7 + drei 10.7 +
three-stdlib + three-mesh-bvh, Vitest + jsdom + Testing Library +
@react-three/test-renderer, react-cosmos 7 (UI on :5100, renderer on :5050),
Python Playwright for measurements and the live pass.

**Spec:** `docs/superpowers/specs/2026-09-10-territory-viewer-v2-design.md`
— read it first; every ruling this plan leans on is argued there.

**Mock digest:** `.superpowers/sdd/2026-09-10-territory-viewer-v2/mock-digest.md`
— every measurement, token and string. **Recon:** `recon.md` beside it — the
old code's inventory. Build from them, not from memory. The old sources live
under `frontend/src/` and are quoted by path below; read the file you port.

## Global Constraints

- **Skills first.** Every implementer and reviewer starts by loading, through
  the Skill tool: `ponytail:ponytail`, `clean-code`,
  `superpowers:test-driven-development`, `react-best-practices`,
  `senior-frontend`, `tailwind-patterns`, `frontend-design:frontend-design`.
  **Tasks 7, 9 and 14 additionally load, by name:** `threejs-fundamentals`,
  `threejs-interaction`, `threejs-loaders`, `threejs-geometry`,
  `threejs-materials`, `threejs-textures`, `threejs-lighting`. The
  implementer lists what was loaded in the report; the user checks.
- **Package manager is yarn, never npm.** Version lookups too
  (`yarn info <pkg> version`).
- **Commit by path.** `git add frontend-v2` (or `git add docs/...`). **Never**
  stage `.claude/settings.json` or `backend/go.work.sum` — both are dirty from
  a parallel session and belong to it. After every commit verify the file list
  with `git show --numstat --format="" HEAD | awk '{print $3}'` — no
  `backend/`, no `.claude/` path. `git commit -- frontend-v2` silently leaves
  **new** files behind; stage with `git add`.
- **Frontend-only commits** use `--no-verify` and carry the line
  `Frontend-only; the backend gate is skipped — no Go code changed.`
- **Every commit ends with:**
  `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`
- **Do not push and do not touch PR #38.** The user does that.
- **Break → red → restore → green.** Every task's report shows four outputs:
  the new test failing against a deliberately broken implementation, then
  passing against the restored one. A test that never went red is not a test.
- **200 lines per file**, hand-enforced (skip blanks and comments). Split
  rather than grow. Several old files sit near the cap; the ports below say
  where to split.
- **`clsx` does not merge classes.** One CSS property, one place. Never pass a
  `className` that re-sets a property a variant already sets; add a variant.
  Named `text-*` sizes carry a line-height that `leading-*` composes with —
  that pair is not a collision.
- **Every non-barrel source file needs a sibling `*.spec.ts(x)`; every slice
  directory containing `.tsx` needs a `*.fixture.tsx`.** `architecture.spec.ts`
  and `fixtures.spec.tsx` fail the suite otherwise. The only additions to
  `exempt-modules.ts` are the three named in Task 9.
- **Import boundary:** `shared → entities → features → widgets → pages → app`,
  never past a sibling slice's `index.ts`. Entities may import each other's
  barrels (content ← conversion already does).
- **jsdom computes no styles.** Geometry is verified in Cosmos or the live
  app by `getComputedStyle`, never by asserting a class name. Say which
  surface you measured. Cosmos: `yarn cosmos` (UI :5100, renderer :5050,
  `?fixtureId=<urlencoded {"path","name"}>`); a **new** fixture file needs a
  Cosmos restart (`pkill -f 'node_modules/.bin/cosmos'` first — a stray
  instance sends the next to 5101 and the browser shows a stale build).
  Measurement script pattern:
  `.superpowers/sdd/2026-09-08-territory-conversion-v2/measure.py`.
- **Accessible names are unique on screen.** Name a control after its
  subject: `Delete storage-tank-500 #2`, not `Delete`.
- **Never carry state on colour alone.** A selected row is also
  `aria-pressed`/`aria-current`; a busy button is `aria-busy`.
- **A decision that needs a test goes in a pure function.** The reducer, the
  view models and the grouping are where the branching lives; components and
  three files execute.
- **The gate before "DONE":** `yarn lint` (that is `tsc -b --noEmit && oxlint`
  — a bare `tsc --noEmit` checks nothing here) and `yarn test:coverage`
  (thresholds 90/85/90/90) both green, and `yarn build` succeeds.
- **The Canvas is a boundary.** Nothing inside `<Canvas>` reads React context
  from outside it (`can`, the query client, the theme). Everything crosses as
  props.
- **Local stack:** gateway :8080, `yarn dev` :3001. Root `admin` /
  `change-me-now`; Company Owner `cotest` / `Passw0rd!2026`; `guest1` and
  `editor1` / `Passw0rd!2026`; the login field is `identifier`. Territories:
  `dji-wp46-cut` (real, admin's), `live-cube` (a cube; converts in a second),
  `tenant-a-scene` (cotest's; fails forever, by design). Check which of
  `placement:create/write/delete` `editor1` holds before assuming.

## File map

Created (C), modified (M), deleted (D), moved from `frontend/src` (P = port):

```
frontend-v2/
  package.json                                      M  three stack, test-renderer
  exempt-modules.ts                                 M  three setup files (Task 9)
  public/draco/{draco_decoder.js,draco_decoder.wasm,draco_wasm_wrapper.js}  C (copied from node_modules/three)
  public/basis/{basis_transcoder.js,basis_transcoder.wasm}                 C (copied from node_modules/three)
  src/
    widgets/catalog-shell/ui/catalog-shell.tsx      M  layout="viewport"
    entities/scene/                                 C
      index.ts
      api/scene-gateway.ts (+spec)                  C  getSceneBundle
      api/scene-query.ts (+spec)                    C  sceneQuery
      model/lod.ts (+spec)                          P  shared/domain/lod-artifact.ts
      model/scene-view-model.ts (+spec)             P  viewer/application/scene-view-model.ts (+ sceneReady)
      model/format.ts (+spec)                       M  moved from widgets/viewer-panel/model/format.ts (+ formatDims)
      scene.fixture.tsx                             C  (the slice has no JSX; fixture not required)
    widgets/viewer-panel/                           D  (format moves; ViewerPanel unused)
    widgets/viewer-toolbar/                         D  superseded by ToolRail
    widgets/objects-panel/                          D  superseded by placements-panel
    features/snap/                                  D  superseded by Switch
    features/measure/ui/measure-button.tsx          D  superseded by the rail tile (the feature keeps its hook)
    pages/model-detail/model/detail.tsx             M  import format from entities/scene
    shared/ui/tool-rail/                            C  ToolRail (+spec, fixture)
    shared/ui/mode-chip/                            C  ModeChip
    shared/ui/keycap-hint/                          C  KeycapHint
    shared/ui/switch/                               C  Switch
    shared/ui/lod-switcher/                         C  LodSwitcher
    shared/ui/stats-strip/                          C  StatsStrip
    shared/ui/collapsed-rail/                       C  CollapsedRail
    features/viewer-mode/                           C
      model/viewer-mode.ts (+spec)                  C  reducer
      model/use-keyboard-shortcuts.ts (+spec)       P  viewer/application/use-keyboard-shortcuts.ts
      model/use-viewer-mode.ts (+spec)              C  hook over the reducer + shortcuts
    entities/measurement/                           C
      model/{measurement,chain,distance,unit-ratio}.ts (+specs)  P  measurement/domain/*
      model/measurement-reducer.ts (+spec)          P  measurement/application/measurement-reducer.ts
    features/measure/model/use-measurement-tool.ts (+spec)  P  measurement/application/use-measurement-tool.ts
    features/lod/                                   C
      model/use-progressive-lod.ts (+spec)          P  viewer/application/use-progressive-lod.ts (+ urlOf)
      model/use-lod-download.ts (+spec)             C  fetch → blob URL with progress
      model/lod-progress.ts (+spec)                 C  lodProgress, viewerError
    entities/placement/
      api/placements-gateway.ts (+spec)             P  placement/infrastructure/placement-gateway.ts
      model/mutation-state.ts (+spec)               P  placement/domain/mutation-state.ts
      model/groups.ts (+spec)                       C  groupByModel, instanceName, realWorldScale
      model/placement.ts                            M  ResolvedPlacement, PlacementCreate/Update
      ui/group-row.tsx (+spec)                      C
      ui/instance-row.tsx (+spec)                   C
      ui/object-row.tsx (+spec)                     D  superseded
      index.ts                                      M
    features/placements-editor/                     C
      model/use-placements-editor.ts (+spec)        P  placement/application/use-placements-editor.ts
    widgets/viewer-canvas/                          C
      index.ts                                      C  ViewerCanvas (lazy), preloadViewer, ViewerCanvasProps
      model/scene-colors.ts (+spec)                 C  readSceneColors
      model/focus-box.ts (+spec)                    C  boxOf(ids, root)
      three/gltf-loader-setup.ts                    P  (exempt)
      three/ktx2-init.tsx                           P  (exempt)
      three/glb-preloader.tsx                       P  (exempt)
      three/lod-error-boundary.tsx (+spec)          P
      three/lod-warmer.tsx (+spec)                  P
      three/gltf-model.tsx (+spec)                  P  (+ progress plumbing)
      three/camera-rig.tsx (+spec)                  P
      three/lighting.tsx (+spec)                    P
      three/is-descendant.ts (+spec)                P
      three/snap-to-surface.ts (+spec)              P  placement/application/snap-to-surface.ts
      three/snap-translate.ts (+spec)               P  placement/application/snap-translate.ts
      three/use-gizmo-events.ts (+spec)             P  placement/application/use-gizmo-events.ts
      three/scale-gizmo-patch.ts (+spec)            P
      three/placement-instance.tsx (+spec)          P
      three/placements-layer.tsx (+spec)            P
      three/measurement-layer.tsx (+spec)           P
      three/measurement-segment.tsx (+spec)         P
      three/point-marker.tsx (+spec)                P
      three/focus-on.tsx (+spec)                    C
      three/scene-canvas.tsx (+spec)                P  (panorama props removed, colours in)
      ui/viewer-canvas.tsx (+spec)                  C  DOM wrapper: colours, lazy entry
      viewer-canvas.fixture.tsx                     C
    widgets/overlays-panel/                         C
      model/use-overlays-panel.ts (+spec)           P  viewer/application/use-overlays-panel.ts (+ localStorage)
      ui/overlays-panel.tsx (+spec)                 C
      overlays-panel.fixture.tsx                    C
    widgets/placements-panel/                       C
      ui/placements-panel.tsx (+spec)               C  search, groups, add, footers, empty
      ui/selected-block.tsx (+spec)                 C  segmented, Vec3 grid, snap, create form
      placements-panel.fixture.tsx                  C
    widgets/model-picker/ui/place-objects-modal.tsx (+spec)  C  Modal + picker + stepper + progress line
    features/onboarding/
      model/tour-state.ts (+spec)                   P  onboarding/domain/tour-state.ts
      model/tour-step.ts                            P
      model/use-tour.ts (+spec)                     P  onboarding/application/use-tour.ts
      model/viewer-tour-steps.ts (+spec)            P  (A subset)
      api/tours-gateway.ts (+spec)                  C  markTourSeen
      ui/tour-overlay.tsx (+spec)                   C  dim + halo + TourTooltip
      ui/tour-tooltip.tsx                           M  mock geometry
    pages/territory-viewer/                         C
      model/viewer-view.ts (+spec)                  C  pills, chips, strip rows, header meta
      model/use-territory-viewer.ts (+spec)         C  the container hook
      ui/viewer-header.tsx (+spec)                  C
      ui/viewer-overlays.tsx (+spec)                C  rail, chips, switcher, strip, hints, error card
      ui/territory-viewer-page.tsx (+spec)          C
      ui/territory-viewer-screen.tsx (+spec)        C
      territory-viewer-page.fixture.tsx             C  one fixture per mock state (1–7, 13–17)
    pages/territory-conversion/model/use-territory-conversion.ts (+spec)  M  no leave
    pages/territory-conversion/model/conversion-view.ts (+spec)           M  no shouldLeave, new lede
    pages/territory-conversion/ui/conversion-actions.tsx (+spec)          M  Open the viewer → onOpenViewer stays, wired to invalidate
    shared/lib/leave.ts (+spec)                     D
    app/router/catalog-routes.tsx                   M  loader + branch component
    app/router/territory-route.tsx                  C  (exempt: wiring) the branch component
    app/router/guard.ts                             M  comment only
    pages/territory-catalog/ui/territory-catalog-page.tsx  M  preloadViewer on hover/focus
  CLAUDE.md, ../CLAUDE.md                           M  docs (Task 16)
  .superpowers/sdd/2026-09-10-territory-viewer-v2/live.py  C  the live pass
```

---

### Task 1: Dependencies, the decoder assets, and `CatalogShell layout="viewport"`

**Files:**
- Modify: `frontend-v2/package.json`
- Create: `frontend-v2/public/draco/*`, `frontend-v2/public/basis/*` (copied)
- Modify: `frontend-v2/src/widgets/catalog-shell/ui/catalog-shell.tsx`
- Modify: `frontend-v2/src/widgets/catalog-shell/ui/catalog-shell.spec.tsx`
- Modify: `frontend-v2/src/widgets/catalog-shell/catalog-shell.fixture.tsx`

**Interfaces:**
- Produces: `CatalogShellProps.layout?: "page" | "viewport"` (default `"page"`).

- [ ] **Step 1: Install the three stack at the latest versions, exact pins**

```bash
cd frontend-v2
yarn add three@0.186.0 @react-three/fiber@9.7.0 @react-three/drei@10.7.8 three-stdlib@2.36.1 three-mesh-bvh@0.9.15 --exact
yarn add -D @types/three@0.185.4 @react-three/test-renderer@9.1.1 --exact
```

If `yarn info three version` answers something newer than 0.186.0, take the
newer one and its matching `@types/three` if one exists; record the numbers
in the commit message.

- [ ] **Step 2: Copy the decoder blobs from the installed three, never from `frontend/public`**

```bash
mkdir -p public/draco public/basis
cp node_modules/three/examples/jsm/libs/draco/gltf/draco_decoder.js public/draco/
cp node_modules/three/examples/jsm/libs/draco/gltf/draco_decoder.wasm public/draco/
cp node_modules/three/examples/jsm/libs/draco/gltf/draco_wasm_wrapper.js public/draco/
cp node_modules/three/examples/jsm/libs/basis/basis_transcoder.js public/basis/
cp node_modules/three/examples/jsm/libs/basis/basis_transcoder.wasm public/basis/
ls -la public/draco public/basis
```

Expected: five files, sizes in the same ballpark as `frontend/public`'s
(≈512 KB / 192 KB / 58 KB and ≈57 KB / 527 KB).

- [ ] **Step 3: Confirm `tsc -b` still passes with `@types/three` one minor behind**

Run: `yarn lint`
Expected: exit 0. If it fails on three's types, pin `three@0.185.1` instead,
re-copy the blobs, and say so in the report — the spec records the fallback.

- [ ] **Step 4: Write the failing shell spec**

Append to `src/widgets/catalog-shell/ui/catalog-shell.spec.tsx`:

```tsx
describe("CatalogShell · viewport layout", () => {
  it("drops the page padding and fills the viewport height", () => {
    render(
      <CatalogShell layout="viewport">
        <p>scene</p>
      </CatalogShell>,
    );
    const main = screen.getByRole("main");
    expect(main.className).toContain("h-dvh");
    expect(main.className).not.toContain("px-9");
    expect(main.className).not.toContain("pt-8");
  });

  it("keeps the page layout by default", () => {
    render(
      <CatalogShell>
        <p>page</p>
      </CatalogShell>,
    );
    expect(screen.getByRole("main").className).toContain("px-9");
  });
});
```

(A class-name assertion is acceptable for a *structural* choice — which
layout branch rendered — not for geometry; the geometry is measured in Cosmos
in Step 8.)

- [ ] **Step 5: Run it red**

Run: `yarn vitest run src/widgets/catalog-shell`
Expected: FAIL — `layout` is not a prop; the `h-dvh` assertion fails.

- [ ] **Step 6: Implement**

```tsx
import type { ReactNode } from "react";

export type CatalogShellProps = {
  children: ReactNode;
  /**
   * page — the catalog screens: a padded document-flow column.
   * viewport — the territory viewer: a full-height flex column with no
   * padding, so the scene and its absolutely-positioned overlays own the
   * whole window under the page's own top bar.
   */
  layout?: "page" | "viewport";
};

const MAIN: Record<NonNullable<CatalogShellProps["layout"]>, string> = {
  page: "flex min-w-0 flex-col gap-[22px] px-9 pb-[72px] pt-8",
  viewport: "flex h-dvh min-w-0 flex-col overflow-hidden",
};

/**
 * The chrome around the catalog screens and the viewer: unlike the console,
 * there is no sidebar — the page header carries its own back link and action.
 */
export function CatalogShell({ children, layout = "page" }: CatalogShellProps) {
  return (
    <div className="min-h-dvh bg-bg text-fg">
      <main className={MAIN[layout]}>{children}</main>
    </div>
  );
}
```

- [ ] **Step 7: Run it green**

Run: `yarn vitest run src/widgets/catalog-shell`
Expected: PASS.

- [ ] **Step 8: Fixture + measurement**

Add a `viewport` entry to `catalog-shell.fixture.tsx` wrapping a
`<div className="flex-1 bg-panel" />`. Restart Cosmos, measure `main` with
`measure.py` (props `height,paddingTop,paddingLeft`): expected height =
viewport height, paddings `0px`, both themes. Put the numbers in the report.

- [ ] **Step 9: Commit**

```bash
git add frontend-v2/package.json frontend-v2/yarn.lock frontend-v2/public/draco frontend-v2/public/basis frontend-v2/src/widgets/catalog-shell
git commit --no-verify -m "feat(frontend-v2): the three stack, the decoder blobs, and CatalogShell layout=viewport

three 0.186.0, fiber 9.7.0, drei 10.7.8, three-stdlib 2.36.1, three-mesh-bvh
0.9.15, @types/three 0.185.4, test-renderer 9.1.1. Draco and Basis blobs are
copied from the installed three so the transcoder matches the loader.

Frontend-only; the backend gate is skipped — no Go code changed.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git show --numstat --format="" HEAD | awk '{print $3}'
```

---

### Task 2: `entities/scene` — the bundle, the query, the LOD chain, the view model, the formatters

**Files:**
- Create: `src/entities/scene/index.ts`
- Create: `src/entities/scene/api/scene-gateway.ts` (+ `.spec.ts`)
- Create: `src/entities/scene/api/scene-query.ts` (+ `.spec.ts`)
- Create: `src/entities/scene/model/lod.ts` (+ `.spec.ts`) — port of `frontend/src/shared/domain/lod-artifact.ts`
- Create: `src/entities/scene/model/scene-view-model.ts` (+ `.spec.ts`) — port of `frontend/src/viewer/application/scene-view-model.ts`
- Move: `src/widgets/viewer-panel/model/format.ts` → `src/entities/scene/model/format.ts` (+ spec), add `formatDims`
- Modify: `src/entities/placement/model/placement.ts` — add `ResolvedPlacement`, `PlacementCreate`, `PlacementUpdate`
- Delete: `src/widgets/viewer-panel/` (whole slice)
- Modify: `src/pages/model-detail/model/detail.tsx:8` — import from `@/entities/scene`

**Interfaces:**
- Produces:
  - `type LodArtifact = { lod: number; hash: string; size: number; vertices?: number; faces?: number }`
  - `orderByPreferred(chain, preferred)`, `pickLod(chain, preferred = 0)`, `pickCoarsest(chain)`, `selectProgressive(chain, targetLod, ready) → { show, warm }` — verbatim from the old file.
  - `type SceneBundle = { territory: Territory; artifact: SceneArtifact | null; placements: Placement[]; modelOptions: ModelOption[] }`
  - `type SceneArtifact = { lod: number; hash: string; size: number; vertices: number; faces: number; bboxMin: Vec3; bboxMax: Vec3; chain: LodArtifact[] }`
  - `type ModelOption = { slug: string; title: string; thumbnailBlobHash?: string; bboxMin?: Vec3; bboxMax?: Vec3; chain: LodArtifact[] }`
  - `getSceneBundle(slug): Promise<SceneBundle>`; `sceneQuery(slug)` with key `["scene", slug]`.
  - `sceneReady(bundle): boolean` (true when `artifact !== null` and its chain holds `lod === 0`).
  - `type SceneMetadata = { dims: Vec3; units: "metres"; vertices: number; faces: number; uploadedAt: string | null }`
  - `toSceneViewModel(bundle): { parentLods: LodArtifact[]; metadata: SceneMetadata; placements: ResolvedPlacement[] } | null`
  - `type ResolvedPlacement = Placement & { chain: LodArtifact[] }` (in `entities/placement`)
  - `formatDims(dims: Vec3): string` → `36.0 × 24.0 × 8.5 m`; `groupDigits(n)`; `formatSize(bytes)` (moved as they are).

- [ ] **Step 1: Write the failing specs**

`src/entities/scene/model/lod.spec.ts` — port
`frontend/src/viewer/application/use-progressive-lod.spec.tsx`'s pure
expectations into direct calls, plus:

```ts
import { describe, expect, it } from "vitest";
import { orderByPreferred, pickCoarsest, pickLod, selectProgressive } from "./lod";

const chain = [
  { lod: 0, hash: "a", size: 30 },
  { lod: 1, hash: "b", size: 20 },
  { lod: 2, hash: "c", size: 10 },
];

describe("lod chain", () => {
  it("orders by closeness to the preferred level, ties toward quality", () => {
    expect(orderByPreferred(chain, 1).map((a) => a.lod)).toEqual([1, 0, 2]);
  });
  it("picks the requested level or the closest one", () => {
    expect(pickLod(chain, 2)?.hash).toBe("c");
    expect(pickLod(chain, 5)?.hash).toBe("c");
    expect(pickLod([], 0)).toBeNull();
  });
  it("names the coarsest level", () => {
    expect(pickCoarsest(chain)?.lod).toBe(2);
    expect(pickCoarsest([])).toBeNull();
  });
  it("shows the coarsest and warms the target until ready", () => {
    expect(selectProgressive(chain, 0, false)).toEqual({ show: chain[2], warm: chain[0] });
    expect(selectProgressive(chain, 0, true)).toEqual({ show: chain[0], warm: null });
    expect(selectProgressive(chain, 2, false)).toEqual({ show: chain[2], warm: null });
    expect(selectProgressive([chain[0]], 0, false)).toEqual({ show: chain[0], warm: null });
  });
});
```

`src/entities/scene/model/scene-view-model.spec.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { SceneBundle } from "../api/scene-gateway";
import { sceneReady, toSceneViewModel } from "./scene-view-model";

const territory = { slug: "t", title: "Refinery Block C", sourceBlobHash: "s", placementCount: 1, createdAt: "2026-09-04T10:00:00Z" };
const chain = [
  { lod: 0, hash: "a", size: 30, vertices: 1_284_210, faces: 612_480 },
  { lod: 2, hash: "c", size: 10 },
];
const artifact = { lod: 0, hash: "a", size: 30, vertices: 1_284_210, faces: 612_480, bboxMin: { x: 0, y: 0, z: 0 }, bboxMax: { x: 36, y: 8.5, z: 24 }, chain };
const placement = { id: 7, territorySlug: "t", modelSlug: "tank", label: "", updatedAt: "", visiblePanoramaIds: [], position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } };
const bundle: SceneBundle = {
  territory,
  artifact,
  placements: [placement],
  modelOptions: [{ slug: "tank", title: "storage-tank-500", chain: [{ lod: 0, hash: "m0", size: 5 }] }],
};

describe("sceneReady", () => {
  it("is true only with a LOD0 in the chain", () => {
    expect(sceneReady(bundle)).toBe(true);
    expect(sceneReady({ ...bundle, artifact: null })).toBe(false);
    expect(sceneReady({ ...bundle, artifact: { ...artifact, chain: [chain[1]] } })).toBe(false);
  });
});

describe("toSceneViewModel", () => {
  it("returns null when nothing is converted", () => {
    expect(toSceneViewModel({ ...bundle, artifact: null })).toBeNull();
  });
  it("carries the chain, the metadata and each placement's model chain", () => {
    const vm = toSceneViewModel(bundle)!;
    expect(vm.parentLods).toBe(chain);
    expect(vm.metadata).toEqual({
      dims: { x: 36, y: 8.5, z: 24 },
      units: "metres",
      vertices: 1_284_210,
      faces: 612_480,
      uploadedAt: "2026-09-04T10:00:00Z",
    });
    expect(vm.placements[0].chain).toEqual([{ lod: 0, hash: "m0", size: 5 }]);
  });
  it("gives a placement of an unconverted model an empty chain", () => {
    const vm = toSceneViewModel({ ...bundle, modelOptions: [] })!;
    expect(vm.placements[0].chain).toEqual([]);
  });
  it("reads the uploaded date as null when the territory has none", () => {
    const vm = toSceneViewModel({ ...bundle, territory: { ...territory, createdAt: undefined } })!;
    expect(vm.metadata.uploadedAt).toBeNull();
  });
});
```

`src/entities/scene/api/scene-gateway.spec.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { getSceneBundle } from "./scene-gateway";

const dto = {
  territory: { slug: "t", title: "T", sourceBlobHash: "s" },
  artifact: { slug: "t", lod: 0, hash: "a", contentType: "model/gltf-binary", size: 30, vertices: 10, faces: 4, bboxMin: { x: 0, y: 0, z: 0 }, bboxMax: { x: 2, y: 1, z: 2 }, artifacts: [{ lod: 0, hash: "a", size: 30 }, { lod: 2, hash: "c", size: 10 }] },
  placements: [{ id: 1, territorySlug: "t", modelSlug: "m", position: { x: 1, y: 2, z: 3 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } }],
  modelOptions: [{ slug: "m", title: "M", artifacts: [] }],
  panoramas: [{ id: 9 }],
  documents: [{ id: 8 }],
};

describe("getSceneBundle", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("maps the bundle and ignores the panoramas and documents for now", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(dto), { status: 200, headers: { "Content-Type": "application/json" } })));
    const bundle = await getSceneBundle("t");
    expect((fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0]).toBe("/api/territories/t/scene");
    expect(bundle.artifact?.chain.map((a) => a.lod)).toEqual([0, 2]);
    expect(bundle.artifact?.bboxMax).toEqual({ x: 2, y: 1, z: 2 });
    expect(bundle.placements[0]).toMatchObject({ id: 1, label: "", updatedAt: "", visiblePanoramaIds: [] });
    expect(bundle.modelOptions[0].chain).toEqual([]);
    expect("panoramas" in bundle).toBe(false);
  });

  it("falls back to a one-entry chain when /scene carries no artifacts[]", async () => {
    const { artifacts: _a, ...single } = dto.artifact;
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ...dto, artifact: single }), { status: 200, headers: { "Content-Type": "application/json" } })));
    const bundle = await getSceneBundle("t");
    expect(bundle.artifact?.chain).toEqual([{ lod: 0, hash: "a", size: 30, vertices: 10, faces: 4 }]);
  });

  it("answers null for an unconverted territory", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ...dto, artifact: undefined }), { status: 200, headers: { "Content-Type": "application/json" } })));
    expect((await getSceneBundle("t")).artifact).toBeNull();
  });
});
```

Look at how `src/entities/content/api/artifacts-gateway.spec.ts` stubs
`fetch` and copy that shape if it differs from the above.

`src/entities/scene/api/scene-query.spec.ts`:

```ts
import { describe, expect, it } from "vitest";
import { sceneQuery } from "./scene-query";

describe("sceneQuery", () => {
  it("keys on the slug", () => {
    expect(sceneQuery("north").queryKey).toEqual(["scene", "north"]);
  });
});
```

`src/entities/scene/model/format.spec.ts` — move
`widgets/viewer-panel/model/format.spec.ts` and add:

```ts
it("formats dimensions to one decimal in metres", () => {
  expect(formatDims({ x: 36, y: 8.5, z: 24 })).toBe("36.0 × 8.5 × 24.0 m");
});
```

(Order is x × y × z as the bbox gives them; the mock's `36.0 × 24.0 × 8.5`
is a drawn example, not a reordering rule.)

- [ ] **Step 2: Run them red**

Run: `yarn vitest run src/entities/scene`
Expected: FAIL — modules do not exist.

- [ ] **Step 3: Implement**

`src/entities/scene/model/lod.ts` — copy
`frontend/src/shared/domain/lod-artifact.ts` verbatim (types and four
functions; keep its comments).

`src/entities/placement/model/placement.ts` — append:

```ts
import type { LodArtifact } from "@/entities/scene";

/** A placement with its model's LOD chain; empty when the model is not converted. */
export type ResolvedPlacement = Placement & { chain: LodArtifact[] };

export type PlacementCreate = {
  modelSlug: string;
  position?: Vec3;
  rotation?: Vec3;
  scale?: Vec3;
  label?: string;
};

export type PlacementUpdate = PlacementTransform & { label: string };
```

Careful: `entities/scene` imports `Placement` from `entities/placement`, and
`entities/placement` imports the `LodArtifact` type from `entities/scene`.
Both are `import type`, so Vite's graph carries no runtime cycle; keep both
as type-only imports. Export the three types from `entities/placement/index.ts`.

`src/entities/scene/api/scene-gateway.ts`:

```ts
import { httpGet } from "@/shared/api";
import type { components } from "@/shared/api/dto";
import type { Placement, Vec3 } from "@/entities/placement";
import type { Territory } from "@/entities/territory";
import type { LodArtifact } from "../model/lod";

type BundleDto = components["schemas"]["SceneBundle"];
type ArtifactDto = components["schemas"]["Artifact"];
type PlacementDto = components["schemas"]["Placement"];
type OptionDto = components["schemas"]["AssetOption"];

export type SceneArtifact = {
  lod: number;
  hash: string;
  size: number;
  vertices: number;
  faces: number;
  bboxMin: Vec3;
  bboxMax: Vec3;
  /** Every converted level, LOD0 included; /scene is the one call that carries it. */
  chain: LodArtifact[];
};

export type ModelOption = {
  slug: string;
  title: string;
  thumbnailBlobHash?: string;
  bboxMin?: Vec3;
  bboxMax?: Vec3;
  chain: LodArtifact[];
};

export type SceneBundle = {
  territory: Territory;
  artifact: SceneArtifact | null;
  placements: Placement[];
  modelOptions: ModelOption[];
};

const ZERO: Vec3 = { x: 0, y: 0, z: 0 };

const toArtifact = (a: ArtifactDto): SceneArtifact => ({
  lod: a.lod,
  hash: a.hash,
  size: a.size,
  vertices: a.vertices ?? 0,
  faces: a.faces ?? 0,
  bboxMin: a.bboxMin ?? ZERO,
  bboxMax: a.bboxMax ?? ZERO,
  // An older gateway answers without the chain; the artifact is then its own one-entry chain.
  chain: a.artifacts ?? [{ lod: a.lod, hash: a.hash, size: a.size, vertices: a.vertices, faces: a.faces }],
});

const toPlacement = (d: PlacementDto): Placement => ({
  id: d.id,
  territorySlug: d.territorySlug,
  modelSlug: d.modelSlug,
  position: d.position,
  rotation: d.rotation,
  scale: d.scale,
  label: d.label ?? "",
  updatedAt: d.updatedAt ?? "",
  visiblePanoramaIds: d.visiblePanoramaIds ?? [],
});

const toOption = (o: OptionDto): ModelOption => ({
  slug: o.slug,
  title: o.title,
  thumbnailBlobHash: o.thumbnailBlobHash,
  bboxMin: o.bboxMin,
  bboxMax: o.bboxMax,
  chain: o.artifacts ?? [],
});

/** One round trip for the viewer: the territory, its LOD chain, the placements and every placeable model. */
export async function getSceneBundle(slug: string): Promise<SceneBundle> {
  const d = await httpGet<BundleDto>(`/api/territories/${encodeURIComponent(slug)}/scene`);
  return {
    // The territory mapper lives in entities/territory; /scene's Territory is the same DTO.
    territory: { ...d.territory, placementCount: d.territory.placementCount ?? 0 },
    artifact: d.artifact ? toArtifact(d.artifact) : null,
    placements: d.placements.map(toPlacement),
    modelOptions: d.modelOptions.map(toOption),
  };
}
```

If `entities/territory` already exports its DTO→domain mapper (look for
`toTerritory` in `src/entities/territory/api/`), import and use it instead
of the inline spread; the spec above does not care which.

`src/entities/scene/api/scene-query.ts`:

```ts
import { queryOptions } from "@tanstack/react-query";
import { getSceneBundle } from "./scene-gateway";

/** The viewer's one fetch. 30 s: a placement edit invalidates it explicitly; nothing else changes the bundle under a reader. */
export const sceneQuery = (slug: string) =>
  queryOptions({ queryKey: ["scene", slug], queryFn: () => getSceneBundle(slug), staleTime: 30_000 });
```

`src/entities/scene/model/scene-view-model.ts`:

```ts
import type { ResolvedPlacement, Vec3 } from "@/entities/placement";
import type { SceneBundle } from "../api/scene-gateway";
import type { LodArtifact } from "./lod";

export type SceneMetadata = {
  /** Source-unit extents of the LOD0 bbox. Zero on every axis when the artifact carries none. */
  dims: Vec3;
  units: "metres";
  vertices: number;
  faces: number;
  /** The territory's createdAt; the gateway records no uploader. */
  uploadedAt: string | null;
};

export type SceneViewModel = {
  parentLods: LodArtifact[];
  metadata: SceneMetadata;
  placements: ResolvedPlacement[];
};

/** The route's branch: the viewer needs a LOD0; anything else is the conversion page. */
export const sceneReady = (bundle: SceneBundle): boolean =>
  bundle.artifact !== null && bundle.artifact.chain.some((a) => a.lod === 0);

const axis = (min: number, max: number) => Number((max - min).toFixed(2));

/** Pure bundle → what the viewer renders. Null when nothing is converted. */
export function toSceneViewModel(bundle: SceneBundle): SceneViewModel | null {
  const { territory, artifact, placements, modelOptions } = bundle;
  if (!artifact) return null;
  const chainBySlug = new Map(modelOptions.map((o) => [o.slug, o.chain]));
  return {
    parentLods: artifact.chain,
    metadata: {
      dims: {
        x: axis(artifact.bboxMin.x, artifact.bboxMax.x),
        y: axis(artifact.bboxMin.y, artifact.bboxMax.y),
        z: axis(artifact.bboxMin.z, artifact.bboxMax.z),
      },
      units: "metres",
      vertices: artifact.vertices,
      faces: artifact.faces,
      uploadedAt: territory.createdAt ?? null,
    },
    placements: placements.map((p) => ({ ...p, chain: chainBySlug.get(p.modelSlug) ?? [] })),
  };
}
```

`src/entities/scene/model/format.ts` — move the file from
`widgets/viewer-panel/model/format.ts` (`git mv`), then append:

```ts
/** The stats strip's first span: source-unit extents to one decimal. */
export const formatDims = (d: Vec3): string =>
  `${d.x.toFixed(1)} × ${d.y.toFixed(1)} × ${d.z.toFixed(1)} m`;
```

with `import type { Vec3 } from "@/entities/placement";`.

`src/entities/scene/index.ts`:

```ts
export { getSceneBundle, type ModelOption, type SceneArtifact, type SceneBundle } from "./api/scene-gateway";
export { sceneQuery } from "./api/scene-query";
export { orderByPreferred, pickCoarsest, pickLod, selectProgressive, type LodArtifact, type ProgressiveSelection } from "./model/lod";
export { sceneReady, toSceneViewModel, type SceneMetadata, type SceneViewModel } from "./model/scene-view-model";
export { formatDims, formatSize, groupDigits } from "./model/format";
```

Delete `src/widgets/viewer-panel/` entirely (`git rm -r`); change
`src/pages/model-detail/model/detail.tsx:8` to
`import { formatSize, groupDigits } from "@/entities/scene";`.

- [ ] **Step 4: Run green, then the whole gate**

Run: `yarn vitest run src/entities src/pages/model-detail && yarn lint`
Expected: PASS; lint 0. `architecture.spec` will complain if a `.tsx`
exists in `entities/scene` without a fixture — there is none, so no fixture
is required.

- [ ] **Step 5: Commit**

```bash
git add frontend-v2/src/entities/scene frontend-v2/src/entities/placement frontend-v2/src/widgets/viewer-panel frontend-v2/src/pages/model-detail
git commit --no-verify -m "feat(frontend-v2): entities/scene — the bundle, sceneReady, the LOD chain and the formatters

Frontend-only; the backend gate is skipped — no Go code changed.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git show --numstat --format="" HEAD | awk '{print $3}'
```

---

### Task 3: `shared/ui` — `ToolRail`, `ModeChip`, `KeycapHint`, `Switch`

**Files:**
- Create: `src/shared/ui/tool-rail/{tool-rail.tsx,tool-rail.spec.tsx,tool-rail.fixture.tsx,index.ts}`
- Create: `src/shared/ui/mode-chip/{mode-chip.tsx,mode-chip.spec.tsx,mode-chip.fixture.tsx,index.ts}`
- Create: `src/shared/ui/keycap-hint/{keycap-hint.tsx,keycap-hint.spec.tsx,keycap-hint.fixture.tsx,index.ts}`
- Create: `src/shared/ui/switch/{switch.tsx,switch.spec.tsx,switch.fixture.tsx,index.ts}`
- Delete: `src/features/snap/` (whole slice), `src/features/measure/ui/measure-button.tsx` (+ spec; the feature's fixture is rewritten in Task 6)

**Interfaces:**
- Produces:
  - `ToolRail({ tools: ToolRailItem[]; label: string })`, `ToolRailItem = { key: string; glyph: ReactNode; name: string; state?: "active" | "idle" | "inert"; onClick?: () => void }`. Renders `role="toolbar" aria-label={label}`; each tool a `<button aria-label={name} aria-pressed={state === "active"} aria-disabled={state === "inert"}>`.
  - `ModeChip({ children; tone?: "accent" | "neutral"; icon?: IconName; spinning?: boolean; kbd?: string; className? })`.
  - `KeycapHint({ keyLabel: string; children: ReactNode })`.
  - `Switch({ checked: boolean; onChange: (next: boolean) => void; label: string; disabled? })` — `role="switch"`, `aria-checked`, the label is `aria-label` (the visible text sits beside it, in the caller).

Geometry (mock digest → tokens): rail `p-1 gap-1 rounded-[10px] border
border-line-2 bg-panel shadow-elevation`; tile `size-[30px] rounded-[7px]
font-mono text-[12px]`; active `bg-accent-soft text-accent`; idle
`text-muted hover:text-fg`; inert `text-dim cursor-default`. Chip `px-[11px]
py-[5px] rounded-[8px] font-mono text-[10px] tracking-[0.1em]
shadow-elevation`; accent `border-accent bg-accent-soft text-accent`;
neutral `border-line-2 bg-panel text-muted`; the loading variant is
uppercase `tracking-[0.16em] px-[11px] py-1.5` — expose it as
`tone="accent" spinning` and let `spinning` add the uppercase. Keycap chip
`gap-1.5 px-[9px] py-1 rounded-[7px] border border-line bg-panel font-mono
text-[9px] text-muted`; kbd `rounded-[4px] border border-line-2 px-[5px]
py-px text-fg`. Switch `h-[18px] w-[34px] rounded-full p-0.5` with a
`size-3.5` knob; checked `bg-accent` + knob `bg-accent-fg` at the end;
unchecked `bg-line-2` + knob `bg-panel` at the start.

- [ ] **Step 1: Write the failing specs**

`tool-rail.spec.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ToolRail } from "./tool-rail";

const tools = (onReset = vi.fn(), onMeasure = vi.fn()) => [
  { key: "reset", glyph: "↺", name: "Reset camera", state: "active" as const, onClick: onReset },
  { key: "measure", glyph: "↔", name: "Measure (M)", onClick: onMeasure },
  { key: "tour", glyph: "▶", name: "Replay guided tour", state: "inert" as const, onClick: vi.fn() },
];

describe("ToolRail", () => {
  it("is a named toolbar of named buttons", () => {
    render(<ToolRail label="Viewer tools" tools={tools()} />);
    const bar = screen.getByRole("toolbar", { name: "Viewer tools" });
    expect(bar.querySelectorAll("button")).toHaveLength(3);
    expect(screen.getByRole("button", { name: "Reset camera" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Measure (M)" })).toHaveAttribute("aria-pressed", "false");
  });

  it("marks an inert tool disabled without removing it, and swallows its click", async () => {
    const t = tools();
    render(<ToolRail label="Viewer tools" tools={t} />);
    const tour = screen.getByRole("button", { name: "Replay guided tour" });
    expect(tour).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(tour);
    expect(t[2].onClick).not.toHaveBeenCalled();
  });

  it("fires the tool's handler", async () => {
    const onMeasure = vi.fn();
    render(<ToolRail label="Viewer tools" tools={tools(vi.fn(), onMeasure)} />);
    await userEvent.click(screen.getByRole("button", { name: "Measure (M)" }));
    expect(onMeasure).toHaveBeenCalledOnce();
  });
});
```

`mode-chip.spec.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ModeChip } from "./mode-chip";

describe("ModeChip", () => {
  it("renders its text as a status line", () => {
    render(<ModeChip>orbit · drag to rotate</ModeChip>);
    expect(screen.getByRole("status")).toHaveTextContent("orbit · drag to rotate");
  });
  it("draws the kbd after the text", () => {
    render(<ModeChip kbd="P">panorama · next</ModeChip>);
    expect(screen.getByRole("status").querySelector("kbd")).toHaveTextContent("P");
  });
  it("marks the spinning variant busy", () => {
    render(<ModeChip spinning icon="refresh">Loading model</ModeChip>);
    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
  });
});
```

`keycap-hint.spec.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { KeycapHint } from "./keycap-hint";

describe("KeycapHint", () => {
  it("names the key in a kbd and the action beside it", () => {
    render(<KeycapHint keyLabel="Esc">exit / deselect</KeycapHint>);
    expect(screen.getByText("Esc").tagName).toBe("KBD");
    expect(screen.getByText("exit / deselect")).toBeInTheDocument();
  });
});
```

`switch.spec.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Switch } from "./switch";

describe("Switch", () => {
  it("is a named switch that reports its state", () => {
    render(<Switch checked label="Snap to surface" onChange={vi.fn()} />);
    expect(screen.getByRole("switch", { name: "Snap to surface" })).toHaveAttribute("aria-checked", "true");
  });
  it("flips on click and on Space", async () => {
    const onChange = vi.fn();
    render(<Switch checked={false} label="Snap to surface" onChange={onChange} />);
    await userEvent.click(screen.getByRole("switch"));
    expect(onChange).toHaveBeenCalledWith(true);
    screen.getByRole("switch").focus();
    await userEvent.keyboard(" ");
    expect(onChange).toHaveBeenCalledTimes(2);
  });
  it("does nothing while disabled", async () => {
    const onChange = vi.fn();
    render(<Switch checked disabled label="Snap to surface" onChange={onChange} />);
    await userEvent.click(screen.getByRole("switch"));
    expect(onChange).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run them red**

Run: `yarn vitest run src/shared/ui/tool-rail src/shared/ui/mode-chip src/shared/ui/keycap-hint src/shared/ui/switch`
Expected: FAIL — modules missing.

- [ ] **Step 3: Implement**

`tool-rail.tsx`:

```tsx
import { clsx as cx } from "clsx";
import type { ReactNode } from "react";

export type ToolRailItem = {
  key: string;
  /** A mono glyph or an <Icon>. */
  glyph: ReactNode;
  /** The accessible name and the title — unique on screen. */
  name: string;
  /** inert: drawn dim and unclickable, kept in place so the rail never shifts. */
  state?: "active" | "idle" | "inert";
  onClick?: () => void;
};

export type ToolRailProps = { tools: ToolRailItem[]; label: string; className?: string };

const TILE: Record<NonNullable<ToolRailItem["state"]>, string> = {
  active: "bg-accent-soft text-accent",
  idle: "cursor-pointer text-muted hover:text-fg",
  inert: "cursor-default text-dim",
};

/** The viewport's 30px tool tiles in a 4px panel — one glyph, one name each. */
export function ToolRail({ tools, label, className }: ToolRailProps) {
  return (
    <div
      role="toolbar"
      aria-label={label}
      className={cx("flex gap-1 rounded-[10px] border border-line-2 bg-panel p-1 shadow-elevation", className)}
    >
      {tools.map(({ key, glyph, name, state = "idle", onClick }) => (
        <button
          key={key}
          type="button"
          title={name}
          aria-label={name}
          aria-pressed={state === "active"}
          aria-disabled={state === "inert" || undefined}
          onClick={state === "inert" ? undefined : onClick}
          className={cx(
            "flex size-[30px] items-center justify-center rounded-[7px] border-none bg-transparent font-mono text-[12px] transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent",
            TILE[state],
          )}
        >
          {glyph}
        </button>
      ))}
    </div>
  );
}
```

(`bg-transparent` on the base and `bg-accent-soft` on the active tile both
set background — that is the clsx collision the constraints forbid. Move
`bg-transparent` into the `idle` and `inert` entries instead. Same for
`cursor-pointer`/`cursor-default`: already per-state. Apply this rule to
every component in this task.)

`mode-chip.tsx`:

```tsx
import { clsx as cx } from "clsx";
import type { ReactNode } from "react";
import { Icon, type IconName } from "@/shared/ui/icon";

export type ModeChipProps = {
  children: ReactNode;
  tone?: "accent" | "neutral";
  icon?: IconName;
  /** The loading chip: uppercase, wider tracking, the icon turning, aria-busy. */
  spinning?: boolean;
  kbd?: string;
  className?: string;
};

const TONE = {
  accent: "border-accent bg-accent-soft text-accent",
  neutral: "border-line-2 bg-panel text-muted",
} as const;

/** The line under the tool rail that says what the pointer does right now. */
export function ModeChip({ children, tone = "accent", icon, spinning = false, kbd, className }: ModeChipProps) {
  return (
    <span
      role="status"
      aria-busy={spinning || undefined}
      className={cx(
        "inline-flex items-center gap-2 rounded-[8px] border font-mono text-[10px] shadow-elevation",
        spinning ? "px-[11px] py-1.5 uppercase tracking-[0.16em]" : "px-[11px] py-[5px] tracking-[0.1em]",
        TONE[tone],
        className,
      )}
    >
      {icon ? <Icon name={icon} size={12} className={spinning ? "animate-spin motion-reduce:animate-none" : undefined} /> : null}
      {children}
      {kbd ? <kbd className="rounded-[4px] border border-accent-line px-[5px] py-px">{kbd}</kbd> : null}
    </span>
  );
}
```

`keycap-hint.tsx`:

```tsx
import type { ReactNode } from "react";

export type KeycapHintProps = { keyLabel: string; children: ReactNode };

/** `M measure` — a key and what it does, in the viewport's corner. */
export function KeycapHint({ keyLabel, children }: KeycapHintProps) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-[7px] border border-line bg-panel px-[9px] py-1 font-mono text-[9px] text-muted">
      <kbd className="rounded-[4px] border border-line-2 px-[5px] py-px text-fg">{keyLabel}</kbd>
      {children}
    </span>
  );
}
```

`switch.tsx`:

```tsx
import { clsx as cx } from "clsx";

export type SwitchProps = {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** The accessible name; the visible text sits beside the control in the caller. */
  label: string;
  disabled?: boolean;
  className?: string;
};

/** The 34×18 toggle: a button with role switch, so Space and Enter flip it for free. */
export function Switch({ checked, onChange, label, disabled = false, className }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx(
        "flex h-[18px] w-[34px] shrink-0 items-center rounded-full border-none p-0.5 transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-45",
        checked ? "cursor-pointer justify-end bg-accent" : "cursor-pointer justify-start bg-line-2",
        className,
      )}
    >
      <span aria-hidden="true" className={cx("block size-3.5 rounded-full", checked ? "bg-accent-fg" : "bg-panel")} />
    </button>
  );
}
```

(`cursor-pointer` appears in both branches — hoist it to the base string
and delete it from the branches; `disabled:cursor-not-allowed` is a
different state and composes.)

Barrels: one `index.ts` per slice exporting the component and its props type.

Fixtures: one file per slice, a named map covering every state the mock
draws — rail with `active`/`idle`/`inert` tiles (mock state 1, 3, 6), chip
`accent`, `neutral`, `spinning` (states 1, 3), keycap pair (state 1),
switch on/off/disabled. Component fixtures carry their own `p-6`.

Delete `src/features/snap/` and `src/features/measure/ui/measure-button.tsx`
+ its spec; update `src/features/measure/index.ts` and its fixture to export
nothing but a placeholder until Task 6 fills it (a barrel that exports
nothing fails nothing; the fixture must still render — keep a `<p>` with the
feature's name).

- [ ] **Step 4: Run green**

Run: `yarn vitest run src/shared/ui src/features && yarn lint`
Expected: PASS; 0 lint errors.

- [ ] **Step 5: Measure in Cosmos, both themes**

Restart Cosmos. With `measure.py`, record for each: rail
`padding 4px, gap 4px, borderRadius 10px, boxShadow ≠ none`; tile `30×30,
borderRadius 7px, fontSize 12px`; active tile `color = --accent`; chip
`fontSize 10px, letterSpacing ≈ 1px (0.1em), padding 5px 11px`; spinning chip
`textTransform uppercase, letterSpacing 1.6px`; keycap `fontSize 9px`, kbd
`padding 1px 5px`; switch `34×18`, knob `14×14`. Screenshots beside the
mock's state 1 rail. Numbers go in the report.

- [ ] **Step 6: Commit**

```bash
git add frontend-v2/src/shared/ui frontend-v2/src/features/snap frontend-v2/src/features/measure
git commit --no-verify -m "feat(frontend-v2): ToolRail, ModeChip, KeycapHint and Switch — the viewport's rail chrome

Frontend-only; the backend gate is skipped — no Go code changed.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git show --numstat --format="" HEAD | awk '{print $3}'
```

---

### Task 4: `shared/ui` — `LodSwitcher`, `StatsStrip`, `CollapsedRail`

**Files:**
- Create: `src/shared/ui/lod-switcher/{lod-switcher.tsx,lod-switcher.spec.tsx,lod-switcher.fixture.tsx,index.ts}`
- Create: `src/shared/ui/stats-strip/{stats-strip.tsx,stats-strip.spec.tsx,stats-strip.fixture.tsx,index.ts}`
- Create: `src/shared/ui/collapsed-rail/{collapsed-rail.tsx,collapsed-rail.spec.tsx,collapsed-rail.fixture.tsx,index.ts}`

**Interfaces:**
- Produces:
  - `LodSwitcher({ levels: number[]; target: number; shown: number | null; onChange: (lod: number) => void; label?: string })` — `role="radiogroup"`; one `role="radio"` per level labelled `LOD {n}`; `aria-checked` on `target`; a level that is `shown` but not the target carries `data-shown` and the outline; the target while `shown !== target` carries the loading dot (`aria-label="LOD 0, loading"`).
  - `StatsStrip({ items: string[]; tone?: "neutral" | "bad"; accentLast?: boolean; label?: string })` — `role="status" aria-label={label ?? "Scene stats"}`; first span `text-fg`, the rest `text-muted`; `accentLast` colours the last span `text-accent` (state 3); `tone="bad"` swaps the border and colours the first span `text-bad` (state 6).
  - `CollapsedRail({ label: string; badge?: string; expandName: string; onExpand: () => void })` — the 44 px vertical rail; `<button aria-label={expandName}>`, vertical overline, vertical pill.

Geometry: switcher = rail chrome from Task 3 (`p-1 gap-1 rounded-[10px]
border-line-2 bg-panel shadow-elevation`); segment `rounded-[6px] px-2.5
py-1 font-mono text-[10px]`; target `bg-accent-soft text-accent
font-semibold`; shown-not-target `text-fg border border-line-2` (the only
segment with a border); idle `text-muted`; loading dot `size-[5px]
rounded-full bg-accent` after the label, gap 1.5. Strip `flex flex-wrap
items-center gap-3.5 rounded-[10px] border px-3.5 py-[9px] font-mono
text-[10px] shadow-elevation`; neutral `border-line-2 bg-panel text-muted`;
bad `border-bad bg-panel text-muted`. Collapsed rail `flex w-11 flex-col
items-center gap-3 rounded-card border border-line bg-panel py-2.5
shadow-elevation`; expand button `size-7 rounded-[8px] border border-line-2
bg-panel-2 text-fg` with `Icon name="chevron-left"` (add the glyph to
`glyph-extras.tsx` if absent: path `m14 6-6 6 6 6`, stroke 2); overline
`[writing-mode:vertical-rl] font-mono text-[9px] uppercase tracking-[0.22em]
text-muted`; pill `[writing-mode:vertical-rl] rounded-full border
border-line-2 bg-panel-2 px-[3px] py-[7px] font-mono text-[9px] text-fg`.

- [ ] **Step 1: Write the failing specs**

`lod-switcher.spec.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { LodSwitcher } from "./lod-switcher";

describe("LodSwitcher", () => {
  it("is a radiogroup with the target checked", () => {
    render(<LodSwitcher levels={[0, 1, 2]} target={1} shown={1} onChange={vi.fn()} />);
    expect(screen.getByRole("radiogroup", { name: "Level of detail" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "LOD 1" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "LOD 0" })).toHaveAttribute("aria-checked", "false");
  });

  it("says which level is on screen while the target loads", () => {
    render(<LodSwitcher levels={[0, 1, 2]} target={0} shown={2} onChange={vi.fn()} />);
    expect(screen.getByRole("radio", { name: "LOD 0, loading" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "LOD 2, on screen" })).toHaveAttribute("data-shown", "true");
  });

  it("reports the chosen level", async () => {
    const onChange = vi.fn();
    render(<LodSwitcher levels={[0, 1, 2]} target={0} shown={0} onChange={onChange} />);
    await userEvent.click(screen.getByRole("radio", { name: "LOD 2" }));
    expect(onChange).toHaveBeenCalledWith(2);
  });

  it("moves with the arrow keys", async () => {
    const onChange = vi.fn();
    render(<LodSwitcher levels={[0, 1, 2]} target={1} shown={1} onChange={onChange} />);
    screen.getByRole("radio", { name: "LOD 1" }).focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(onChange).toHaveBeenCalledWith(2);
  });
});
```

`stats-strip.spec.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatsStrip } from "./stats-strip";

describe("StatsStrip", () => {
  it("reads every item as one status line", () => {
    render(<StatsStrip items={["36.0 × 24.0 × 8.5 m", "1 284 210 vertices", "LOD 1 active"]} />);
    const strip = screen.getByRole("status", { name: "Scene stats" });
    expect(strip).toHaveTextContent("36.0 × 24.0 × 8.5 m");
    expect(strip).toHaveTextContent("LOD 1 active");
    expect(strip.querySelectorAll("span")).toHaveLength(3);
  });

  it("marks the bad tone as an alert", () => {
    render(<StatsStrip tone="bad" items={["no geometry loaded", "vertices —"]} />);
    expect(screen.getByRole("alert")).toHaveTextContent("no geometry loaded");
  });
});
```

`collapsed-rail.spec.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CollapsedRail } from "./collapsed-rail";

describe("CollapsedRail", () => {
  it("names the expand button and shows the label and the badge", async () => {
    const onExpand = vi.fn();
    render(<CollapsedRail label="Overlays" badge="4 placed" expandName="Expand Overlays panel" onExpand={onExpand} />);
    await userEvent.click(screen.getByRole("button", { name: "Expand Overlays panel" }));
    expect(onExpand).toHaveBeenCalledOnce();
    expect(screen.getByText("Overlays")).toBeInTheDocument();
    expect(screen.getByText("4 placed")).toBeInTheDocument();
  });
  it("draws no pill without a badge", () => {
    render(<CollapsedRail label="Overlays" expandName="Expand Overlays panel" onExpand={vi.fn()} />);
    expect(screen.queryByText(/placed/)).toBeNull();
  });
});
```

- [ ] **Step 2: Run them red**

Run: `yarn vitest run src/shared/ui/lod-switcher src/shared/ui/stats-strip src/shared/ui/collapsed-rail`
Expected: FAIL — modules missing.

- [ ] **Step 3: Implement**

`lod-switcher.tsx`:

```tsx
import { clsx as cx } from "clsx";
import { useRef, type KeyboardEvent } from "react";
import { nextEnabled } from "@/shared/lib/roving";

export type LodSwitcherProps = {
  levels: number[];
  /** The level the reader asked for. */
  target: number;
  /** The level actually on screen — differs from target while it downloads; null when nothing is drawn. */
  shown: number | null;
  onChange: (lod: number) => void;
  label?: string;
  className?: string;
};

function nameOf(lod: number, target: number, shown: number | null): string {
  if (lod === target && shown !== target) return `LOD ${lod}, loading`;
  if (lod === shown && shown !== target) return `LOD ${lod}, on screen`;
  return `LOD ${lod}`;
}

/** The viewport's level picker; the loading target carries a dot, the level on screen an outline. */
export function LodSwitcher({ levels, target, shown, onChange, label = "Level of detail", className }: LodSwitcherProps) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const onKeyDown = (index: number, event: KeyboardEvent) => {
    const direction = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!direction) return;
    event.preventDefault();
    const next = nextEnabled(levels.length, index, direction, () => false, true);
    onChange(levels[next]);
    buttons.current[next]?.focus();
  };

  return (
    <div role="radiogroup" aria-label={label} className={cx("flex gap-1 rounded-[10px] border border-line-2 bg-panel p-1 shadow-elevation", className)}>
      {levels.map((lod, index) => {
        const isTarget = lod === target;
        const loading = isTarget && shown !== target;
        const onScreen = lod === shown && !isTarget;
        return (
          <button
            key={lod}
            ref={(el) => { buttons.current[index] = el; }}
            type="button"
            role="radio"
            aria-checked={isTarget}
            aria-label={nameOf(lod, target, shown)}
            data-shown={onScreen || undefined}
            tabIndex={isTarget ? 0 : -1}
            onClick={() => onChange(lod)}
            onKeyDown={(e) => onKeyDown(index, e)}
            className={cx(
              "flex cursor-pointer items-center gap-1.5 rounded-[6px] px-2.5 py-1 font-mono text-[10px] transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent",
              isTarget
                ? "border-none bg-accent-soft font-semibold text-accent"
                : onScreen
                  ? "border border-line-2 bg-transparent text-fg"
                  : "border-none bg-transparent text-muted hover:text-fg",
            )}
          >
            LOD {lod}
            {loading ? <span aria-hidden="true" className="size-[5px] rounded-full bg-accent" /> : null}
          </button>
        );
      })}
    </div>
  );
}
```

(The bordered `on screen` segment is 2 px wider than its neighbours. The
mock draws it that way; do not compensate.)

`stats-strip.tsx`:

```tsx
import { clsx as cx } from "clsx";

export type StatsStripProps = {
  items: string[];
  tone?: "neutral" | "bad";
  /** State 3: the last item names what is loading, in accent. */
  accentLast?: boolean;
  label?: string;
  className?: string;
};

/** The bottom-left line of facts about the scene: dimensions, counts, the level on screen. */
export function StatsStrip({ items, tone = "neutral", accentLast = false, label = "Scene stats", className }: StatsStripProps) {
  const last = items.length - 1;
  return (
    <div
      role={tone === "bad" ? "alert" : "status"}
      aria-label={label}
      className={cx(
        "flex flex-wrap items-center gap-3.5 rounded-[10px] border bg-panel px-3.5 py-[9px] font-mono text-[10px] text-muted shadow-elevation",
        tone === "bad" ? "border-bad" : "border-line-2",
        className,
      )}
    >
      {items.map((item, i) => (
        <span
          key={item}
          className={cx(
            i === 0 && (tone === "bad" ? "text-bad" : "text-fg"),
            i === last && accentLast && "text-accent",
          )}
        >
          {item}
        </span>
      ))}
    </div>
  );
}
```

(Keys: the items are strings; two equal items would collide — the page
never emits duplicates, and `key={`${i}-${item}`}` is the safe spelling.
Use that.)

`collapsed-rail.tsx`:

```tsx
import { Icon } from "@/shared/ui/icon";

export type CollapsedRailProps = {
  /** The vertical overline, e.g. "Overlays". */
  label: string;
  /** The vertical pill, e.g. "4 placed"; omitted, no pill. */
  badge?: string;
  /** The expand button's accessible name — unique on screen. */
  expandName: string;
  onExpand: () => void;
  className?: string;
};

/** The 44px strip a collapsed side panel folds into: a way back, a name, a count. */
export function CollapsedRail({ label, badge, expandName, onExpand, className }: CollapsedRailProps) {
  return (
    <div className={cx("flex w-11 flex-col items-center gap-3 rounded-card border border-line bg-panel py-2.5 shadow-elevation", className)}>
      <button
        type="button"
        onClick={onExpand}
        aria-label={expandName}
        title={expandName}
        className="flex size-7 cursor-pointer items-center justify-center rounded-[8px] border border-line-2 bg-panel-2 text-fg transition-colors duration-150 hover:border-accent-line focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <Icon name="chevron-left" size={13} />
      </button>
      <span className="font-mono text-[9px] uppercase tracking-[0.22em] text-muted [writing-mode:vertical-rl]">{label}</span>
      {badge ? (
        <span className="rounded-full border border-line-2 bg-panel-2 px-[3px] py-[7px] font-mono text-[9px] text-fg [writing-mode:vertical-rl]">{badge}</span>
      ) : null}
    </div>
  );
}
```

(Import `clsx as cx`. Add `chevron-left` and `chevron-right` to
`src/shared/ui/icon/glyph-extras.tsx` following the file's existing entry
shape — `{ box: "0 0 24 24", width: 2, path: <path d="m14 6-6 6 6 6" /> }`
and `m10 6 6 6-6 6` — and extend `glyph-extras.spec.ts`'s list if it
enumerates names.)

Barrels and fixtures as in Task 3: switcher `idle` (target 1 shown 1),
`loading` (target 0 shown 2), `single` (levels [0]); strip `neutral`,
`accentLast`, `bad`; rail with and without a badge.

- [ ] **Step 4: Run green**

Run: `yarn vitest run src/shared/ui && yarn lint`
Expected: PASS; lint 0.

- [ ] **Step 5: Measure in Cosmos, both themes**

Switcher segment `padding 4px 10px, fontSize 10px, borderRadius 6px`; the
target `fontWeight 600, color = --accent`; the on-screen segment
`borderWidth 1px`; strip `padding 9px 14px, gap 14px, fontSize 10px`; bad
strip `borderColor = --bad`; rail `width 44px, paddingTop 10px, gap 12px`;
button `28×28`. Report the numbers and the screenshots beside mock states 1,
3 and 6.

- [ ] **Step 6: Commit**

```bash
git add frontend-v2/src/shared/ui
git commit --no-verify -m "feat(frontend-v2): LodSwitcher, StatsStrip and CollapsedRail — the viewport's level picker, facts line and folded panel

Frontend-only; the backend gate is skipped — no Go code changed.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git show --numstat --format="" HEAD | awk '{print $3}'
```

---

### Task 5: `features/viewer-mode` — the reducer, the shortcuts, the hook

**Files:**
- Create: `src/features/viewer-mode/model/viewer-mode.ts` (+ `.spec.ts`)
- Create: `src/features/viewer-mode/model/use-keyboard-shortcuts.ts` (+ `.spec.tsx`) — port of `frontend/src/viewer/application/use-keyboard-shortcuts.ts` and its spec
- Create: `src/features/viewer-mode/model/use-viewer-mode.ts` (+ `.spec.tsx`)
- Create: `src/features/viewer-mode/index.ts`

**Interfaces:**
- Produces:
  - `type ViewerMode = "orbit" | "place" | "measure"`, `type GizmoMode = "translate" | "rotate" | "scale"`.
  - `type ViewerModeState = { mode: ViewerMode; selectedId: number | null; gizmo: GizmoMode; snap: boolean }`, `INITIAL_VIEWER_MODE`.
  - `type ViewerModeAction = { type: "toggleMeasure" } | { type: "exitMeasure" } | { type: "setGizmo"; gizmo: GizmoMode } | { type: "toggleSnap" } | { type: "select"; id: number | null } | { type: "enterPlace" } | { type: "exitPlace" } | { type: "escape"; chainOpen: boolean }`.
  - `viewerModeReducer(state, action): ViewerModeState` — pure. `escape` returns the state unchanged when `chainOpen` is true (the caller cancels the chain itself and passes `chainOpen`), then clears a selection, then leaves `measure`/`place`.
  - `useKeyboardShortcuts(map: Record<string, () => void>)` — verbatim port.
  - `useViewerMode({ canWrite, chainOpen, onCancelChain }) → { state, select, setGizmo, toggleSnap, toggleMeasure, exitMeasure, enterPlace, exitPlace, escape }` — owns the state, binds `M T R S G Escape`; `T/R/S` only act with a selection and `canWrite`.

- [ ] **Step 1: Write the failing reducer spec** (`viewer-mode.spec.ts`)

```ts
import { describe, expect, it } from "vitest";
import { INITIAL_VIEWER_MODE, viewerModeReducer as reduce, type ViewerModeState } from "./viewer-mode";

const selected: ViewerModeState = { ...INITIAL_VIEWER_MODE, selectedId: 7 };
const measuring: ViewerModeState = { ...INITIAL_VIEWER_MODE, mode: "measure" };

describe("viewerModeReducer", () => {
  it("starts in orbit with nothing selected, translate, snap off", () => {
    expect(INITIAL_VIEWER_MODE).toEqual({ mode: "orbit", selectedId: null, gizmo: "translate", snap: false });
  });

  it("entering measure drops the selection; leaving it returns to orbit", () => {
    expect(reduce(selected, { type: "toggleMeasure" })).toEqual({ ...selected, mode: "measure", selectedId: null });
    expect(reduce(measuring, { type: "toggleMeasure" })).toEqual(INITIAL_VIEWER_MODE);
    expect(reduce(measuring, { type: "exitMeasure" })).toEqual(INITIAL_VIEWER_MODE);
    expect(reduce(INITIAL_VIEWER_MODE, { type: "exitMeasure" })).toBe(INITIAL_VIEWER_MODE);
  });

  it("selecting leaves measure and place mode; a null select only clears", () => {
    expect(reduce(measuring, { type: "select", id: 3 })).toEqual({ ...INITIAL_VIEWER_MODE, selectedId: 3 });
    expect(reduce({ ...INITIAL_VIEWER_MODE, mode: "place" }, { type: "select", id: 3 })).toEqual({ ...INITIAL_VIEWER_MODE, selectedId: 3 });
    expect(reduce(selected, { type: "select", id: null })).toEqual(INITIAL_VIEWER_MODE);
  });

  it("gizmo mode and snap are plain switches", () => {
    expect(reduce(selected, { type: "setGizmo", gizmo: "scale" }).gizmo).toBe("scale");
    expect(reduce(INITIAL_VIEWER_MODE, { type: "toggleSnap" }).snap).toBe(true);
  });

  it("place mode is entered from orbit and left back to orbit", () => {
    expect(reduce(selected, { type: "enterPlace" })).toEqual({ ...INITIAL_VIEWER_MODE, mode: "place" });
    expect(reduce({ ...INITIAL_VIEWER_MODE, mode: "place" }, { type: "exitPlace" })).toEqual(INITIAL_VIEWER_MODE);
  });

  // The three Esc layers, top to bottom: an open chain (handled by the caller,
  // reported here as chainOpen), a selection, then the mode itself.
  it("escape: an open chain is the caller's, and the state stays", () => {
    expect(reduce(measuring, { type: "escape", chainOpen: true })).toBe(measuring);
  });
  it("escape: a selection clears before the mode changes", () => {
    expect(reduce({ ...measuring, selectedId: 2 }, { type: "escape", chainOpen: false })).toEqual({ ...measuring, selectedId: null });
    expect(reduce(selected, { type: "escape", chainOpen: false })).toEqual(INITIAL_VIEWER_MODE);
  });
  it("escape: with nothing selected the mode returns to orbit", () => {
    expect(reduce(measuring, { type: "escape", chainOpen: false })).toEqual(INITIAL_VIEWER_MODE);
    expect(reduce({ ...INITIAL_VIEWER_MODE, mode: "place" }, { type: "escape", chainOpen: false })).toEqual(INITIAL_VIEWER_MODE);
    expect(reduce(INITIAL_VIEWER_MODE, { type: "escape", chainOpen: false })).toBe(INITIAL_VIEWER_MODE);
  });
});
```

- [ ] **Step 2: Run red**

Run: `yarn vitest run src/features/viewer-mode`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement the reducer**

```ts
export type ViewerMode = "orbit" | "place" | "measure";
export type GizmoMode = "translate" | "rotate" | "scale";

export type ViewerModeState = {
  mode: ViewerMode;
  selectedId: number | null;
  gizmo: GizmoMode;
  /** Surface magnetism for the translate gizmo; off, the surface is a floor. */
  snap: boolean;
};

export const INITIAL_VIEWER_MODE: ViewerModeState = { mode: "orbit", selectedId: null, gizmo: "translate", snap: false };

export type ViewerModeAction =
  | { type: "toggleMeasure" }
  | { type: "exitMeasure" }
  | { type: "setGizmo"; gizmo: GizmoMode }
  | { type: "toggleSnap" }
  | { type: "select"; id: number | null }
  | { type: "enterPlace" }
  | { type: "exitPlace" }
  /** chainOpen: the measure tool still has a chain to break — that press is its, not ours. */
  | { type: "escape"; chainOpen: boolean };

/**
 * The scene's mutually exclusive interaction modes and the selection. Pure,
 * so every key and click is one table row: entering measure drops the gizmo
 * target (a stray drag must not move a placement), selecting leaves measure
 * and place, and Escape peels one layer at a time.
 */
export function viewerModeReducer(state: ViewerModeState, action: ViewerModeAction): ViewerModeState {
  switch (action.type) {
    case "toggleMeasure":
      return state.mode === "measure" ? { ...state, mode: "orbit" } : { ...state, mode: "measure", selectedId: null };
    case "exitMeasure":
      return state.mode === "measure" ? { ...state, mode: "orbit" } : state;
    case "setGizmo":
      return { ...state, gizmo: action.gizmo };
    case "toggleSnap":
      return { ...state, snap: !state.snap };
    case "select":
      return action.id === null ? { ...state, selectedId: null } : { ...state, mode: "orbit", selectedId: action.id };
    case "enterPlace":
      return { ...state, mode: "place", selectedId: null };
    case "exitPlace":
      return state.mode === "place" ? { ...state, mode: "orbit" } : state;
    case "escape":
      if (action.chainOpen) return state;
      if (state.selectedId !== null) return { ...state, selectedId: null };
      return state.mode === "orbit" ? state : { ...state, mode: "orbit" };
  }
}
```

- [ ] **Step 4: Port `useKeyboardShortcuts` and its spec**

Copy `frontend/src/viewer/application/use-keyboard-shortcuts.ts` and
`use-keyboard-shortcuts.spec.tsx` verbatim into
`src/features/viewer-mode/model/`. The spec imports only React and Testing
Library; fix its import path.

- [ ] **Step 5: Write the failing hook spec** (`use-viewer-mode.spec.tsx`)

```tsx
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useViewerMode } from "./use-viewer-mode";

const press = (key: string) => act(() => { window.dispatchEvent(new KeyboardEvent("keydown", { key })); });

describe("useViewerMode", () => {
  it("M toggles measure and drops the selection", () => {
    const { result } = renderHook(() => useViewerMode({ canWrite: true, chainOpen: false, onCancelChain: vi.fn() }));
    act(() => result.current.select(4));
    press("m");
    expect(result.current.state).toMatchObject({ mode: "measure", selectedId: null });
    press("M");
    expect(result.current.state.mode).toBe("orbit");
  });

  it("T/R/S change the gizmo only with a selection and the write grant", () => {
    const { result, rerender } = renderHook(
      ({ canWrite }) => useViewerMode({ canWrite, chainOpen: false, onCancelChain: vi.fn() }),
      { initialProps: { canWrite: false } },
    );
    act(() => result.current.select(4));
    press("s");
    expect(result.current.state.gizmo).toBe("translate");
    rerender({ canWrite: true });
    press("s");
    expect(result.current.state.gizmo).toBe("scale");
    act(() => result.current.select(null));
    press("r");
    expect(result.current.state.gizmo).toBe("scale");
  });

  it("G toggles snap", () => {
    const { result } = renderHook(() => useViewerMode({ canWrite: true, chainOpen: false, onCancelChain: vi.fn() }));
    press("g");
    expect(result.current.state.snap).toBe(true);
  });

  it("Escape cancels an open chain first, and only then peels the state", () => {
    const onCancelChain = vi.fn();
    const { result, rerender } = renderHook(
      ({ chainOpen }) => useViewerMode({ canWrite: true, chainOpen, onCancelChain }),
      { initialProps: { chainOpen: true } },
    );
    act(() => result.current.toggleMeasure());
    press("Escape");
    expect(onCancelChain).toHaveBeenCalledOnce();
    expect(result.current.state.mode).toBe("measure");
    rerender({ chainOpen: false });
    press("Escape");
    expect(result.current.state.mode).toBe("orbit");
  });

  it("ignores keys typed into a field", () => {
    const { result } = renderHook(() => useViewerMode({ canWrite: true, chainOpen: false, onCancelChain: vi.fn() }));
    const input = document.createElement("input");
    document.body.append(input);
    act(() => { input.dispatchEvent(new KeyboardEvent("keydown", { key: "m", bubbles: true })); });
    expect(result.current.state.mode).toBe("orbit");
    input.remove();
  });
});
```

- [ ] **Step 6: Run red, then implement the hook**

```ts
import { useCallback, useReducer } from "react";
import { useKeyboardShortcuts } from "./use-keyboard-shortcuts";
import { INITIAL_VIEWER_MODE, viewerModeReducer, type GizmoMode } from "./viewer-mode";

export type UseViewerModeParams = {
  /** placement:write — without it the gizmo keys do nothing. */
  canWrite: boolean;
  /** The measure tool has an unfinished chain; Escape breaks it before anything else. */
  chainOpen: boolean;
  onCancelChain: () => void;
};

/** The reducer behind a stable API, with the viewer's keys bound. */
export function useViewerMode({ canWrite, chainOpen, onCancelChain }: UseViewerModeParams) {
  const [state, dispatch] = useReducer(viewerModeReducer, INITIAL_VIEWER_MODE);

  const select = useCallback((id: number | null) => dispatch({ type: "select", id }), []);
  const setGizmo = useCallback((gizmo: GizmoMode) => dispatch({ type: "setGizmo", gizmo }), []);
  const toggleSnap = useCallback(() => dispatch({ type: "toggleSnap" }), []);
  const toggleMeasure = useCallback(() => dispatch({ type: "toggleMeasure" }), []);
  const exitMeasure = useCallback(() => dispatch({ type: "exitMeasure" }), []);
  const enterPlace = useCallback(() => dispatch({ type: "enterPlace" }), []);
  const exitPlace = useCallback(() => dispatch({ type: "exitPlace" }), []);
  const escape = useCallback(() => {
    if (chainOpen) onCancelChain();
    dispatch({ type: "escape", chainOpen });
  }, [chainOpen, onCancelChain]);

  const gizmoKey = (gizmo: GizmoMode) => () => {
    if (canWrite && state.selectedId !== null) setGizmo(gizmo);
  };

  useKeyboardShortcuts({
    m: toggleMeasure,
    t: gizmoKey("translate"),
    r: gizmoKey("rotate"),
    s: gizmoKey("scale"),
    g: toggleSnap,
    Escape: escape,
  });

  return { state, select, setGizmo, toggleSnap, toggleMeasure, exitMeasure, enterPlace, exitPlace, escape };
}
```

Barrel: export the hook, the reducer, the types and `INITIAL_VIEWER_MODE`.

- [ ] **Step 7: Run green + gate**

Run: `yarn vitest run src/features/viewer-mode && yarn lint`
Expected: PASS; lint 0. (The feature has no `.tsx` → no fixture needed.)

- [ ] **Step 8: Commit**

```bash
git add frontend-v2/src/features/viewer-mode
git commit --no-verify -m "feat(frontend-v2): viewer-mode — the reducer for orbit/place/measure, the selection, the gizmo keys and the layered Escape

Frontend-only; the backend gate is skipped — no Go code changed.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git show --numstat --format="" HEAD | awk '{print $3}'
```

---

### Task 6: `entities/measurement` + `features/measure` — the chains, the reducer, the hook

**Files:**
- Create: `src/entities/measurement/model/{measurement.ts,chain.ts,distance.ts,unit-ratio.ts,measurement-reducer.ts}` (+ specs) — ports of `frontend/src/measurement/domain/*` and `frontend/src/measurement/application/measurement-reducer.ts`
- Create: `src/entities/measurement/index.ts`
- Create: `src/features/measure/model/use-measurement-tool.ts` (+ `.spec.tsx`) — port of `frontend/src/measurement/application/use-measurement-tool.ts`
- Create: `src/features/measure/model/measure-summary.ts` (+ `.spec.ts`)
- Modify: `src/features/measure/index.ts`, `src/features/measure/measure.fixture.tsx`

**Interfaces:**
- Produces (verbatim from the old code): `MeasurePoint`, `Measurement`, `Chain`, `CLOSE_TOLERANCE`, `shouldCloseAt`, `appendPoint`, `closeChain`, `chainSegments`, `encodeSegmentId`, `decodeSegmentId`, `removeSegment`, `formatDistance(value, unitRatio)`, `computeUnitRatio(dims)`, `MeasurementState`, `MeasurementAction`, `initialMeasurementState`, `measurementReducer`, `useMeasurementTool() → { measureMode, chains, activeChainId, activeChainStart, click, closeActive, cancelChain, toggle, exit, clear, removeChain, removeSegment }`.
- New: `measureSummary(chains, unitRatio) → { segments: number; total: string }` for the chip `measure · 2 segments · 20.55 m total`.

- [ ] **Step 1: Port the domain and the reducer with their specs**

Copy each file from `frontend/src/measurement/domain/` and
`measurement-reducer.ts` + `measurement-reducer.spec.ts` into
`src/entities/measurement/model/`. Rewrite imports: `@/measurement/domain/x`
→ `./x`; `@/shared/domain/vec3` → `import type { Vec3 } from "@/entities/placement"`.
The old domain tests are `*.test.ts` (node --test); convert each to a
vitest `*.spec.ts` beside its module — same cases, `describe/it/expect`.

- [ ] **Step 2: Run them**

Run: `yarn vitest run src/entities/measurement`
Expected: PASS (ported tests). Break `shouldCloseAt` (return `false`
always), run red, restore, run green — that is this task's red/green proof
for the ported code.

- [ ] **Step 3: Write the failing summary spec** (`measure-summary.spec.ts`)

```ts
import { describe, expect, it } from "vitest";
import { measureSummary } from "./measure-summary";

const p = (x: number, y = 0, z = 0) => ({ x, y, z });

describe("measureSummary", () => {
  it("counts segments across chains and totals their length in source units", () => {
    const chains = [
      { id: 1, points: [p(0), p(1), p(1, 1)], closed: false },
      { id: 2, points: [p(0), p(0, 0, 2)], closed: false },
    ];
    expect(measureSummary(chains, 10)).toEqual({ segments: 3, total: "40.00 m" });
  });
  it("counts the closing segment of a closed chain", () => {
    expect(measureSummary([{ id: 1, points: [p(0), p(1), p(1, 1)], closed: true }], 1).segments).toBe(3);
  });
  it("is empty with no chains", () => {
    expect(measureSummary([], 10)).toEqual({ segments: 0, total: "0.00 m" });
  });
});
```

- [ ] **Step 4: Run red, implement**

```ts
import { chainSegments, formatDistance, type Chain } from "@/entities/measurement";

const length = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/** The mode chip's numbers: how many segments are drawn, and their sum in source units. */
export function measureSummary(chains: Chain[], unitRatio: number): { segments: number; total: string } {
  const segments = chains.flatMap(chainSegments);
  const sum = segments.reduce((acc, s) => acc + length(s.a, s.b), 0);
  return { segments: segments.length, total: formatDistance(sum * unitRatio, unitRatio) };
}
```

- [ ] **Step 5: Port the hook and its spec**

Copy `use-measurement-tool.ts` and `use-measurement-tool.spec.tsx` into
`src/features/measure/model/`; imports → `@/entities/measurement`.

Barrels: `entities/measurement/index.ts` exports everything listed under
Interfaces; `features/measure/index.ts` exports `useMeasurementTool`,
`measureSummary`. The fixture renders the summary for a sample chain in a
`<ModeChip>` — the feature now has JSX only in its fixture, which is fine.

- [ ] **Step 6: Gate + commit**

Run: `yarn vitest run src/entities/measurement src/features/measure && yarn lint`

```bash
git add frontend-v2/src/entities/measurement frontend-v2/src/features/measure
git commit --no-verify -m "feat(frontend-v2): entities/measurement and the measure hook — chains, distances, the reducer, and the chip's summary

Frontend-only; the backend gate is skipped — no Go code changed.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git show --numstat --format="" HEAD | awk '{print $3}'
```

---

### Task 7: `features/lod` — progressive loading with a manual target, a download with progress, the error decision

Load the three.js skills named in Global Constraints before starting.

**Files:**
- Create: `src/features/lod/model/use-progressive-lod.ts` (+ `.spec.tsx`) — port of `frontend/src/viewer/application/use-progressive-lod.ts`
- Create: `src/features/lod/model/use-lod-download.ts` (+ `.spec.tsx`)
- Create: `src/features/lod/model/lod-progress.ts` (+ `.spec.ts`)
- Create: `src/features/lod/index.ts`

**Interfaces:**
- Produces:
  - `useProgressiveLod(chain, targetLod, urlOf = lodUrl) → { url, warmUrl, shown: LodArtifact | null, target: LodArtifact | null, onWarmReady, onWarmFailed, onShownFailed, retry }`. `onShownFailed(err)` records `{ hash, error }` as `failure` (no auto-drop — the page decides); `onWarmFailed` drops the warm hash silently (the old ladder). `retry()` clears the failure and the broken set. `url` is `null` while a failure stands.
  - `useLodDownload(artifact: LodArtifact | null) → { blobUrl: string | null; received: number; failed: { status: number | null } | null }` — fetches `assetUrl(hash)` with a streamed reader; revokes the blob URL on change/unmount.
  - `lodProgress(received, total) → { percent: number; text: string }` → `{ 62, "6.1 / 9.8 MB" }`.
  - `viewerError(failure, chain, target) → { lod: number; status: number | null; file: string; coarser: LodArtifact | null } | null` — the error card's facts.
  - `lodUrl(a: LodArtifact) = assetUrl(a.hash)`.

- [ ] **Step 1: Write the failing specs**

`lod-progress.spec.ts`:

```ts
import { describe, expect, it } from "vitest";
import { lodProgress, viewerError } from "./lod-progress";

describe("lodProgress", () => {
  it("rounds the percent and prints megabytes to one decimal", () => {
    expect(lodProgress(6_400_000, 10_300_000)).toEqual({ percent: 62, text: "6.1 / 9.8 MB" });
  });
  it("clamps at 100 and survives an unknown total", () => {
    expect(lodProgress(20, 10).percent).toBe(100);
    expect(lodProgress(5, 0)).toEqual({ percent: 0, text: "0.0 MB" });
  });
});

const chain = [{ lod: 0, hash: "a", size: 1 }, { lod: 1, hash: "b", size: 1 }, { lod: 2, hash: "c", size: 1 }];

describe("viewerError", () => {
  it("is null without a failure", () => {
    expect(viewerError(null, chain, chain[1], "refinery-block-c")).toBeNull();
  });
  it("names the failed level, the status, the file and a coarser level to fall back to", () => {
    expect(viewerError({ hash: "b", status: 502 }, chain, chain[1], "refinery-block-c")).toEqual({
      lod: 1, status: 502, file: "refinery-block-c-lod1.glb", coarser: chain[2],
    });
  });
  it("offers no coarser level when the failed one is the coarsest", () => {
    expect(viewerError({ hash: "c", status: null }, chain, chain[2], "t")?.coarser).toBeNull();
  });
});
```

`use-progressive-lod.spec.tsx` — port the old spec's cases (coarse first,
swap on ready, a chain change resets readiness, a single-level chain warms
nothing) and add:

```tsx
it("a warm failure drops that level and re-targets the next best", () => {
  const { result } = renderHook(() => useProgressiveLod(chain, 0));
  act(() => result.current.onWarmFailed());
  expect(result.current.target?.lod).toBe(1);
  expect(result.current.shown?.lod).toBe(2);
});

it("a shown failure stands until retry, and hides the scene meanwhile", () => {
  const { result } = renderHook(() => useProgressiveLod([chain[2]], 2));
  act(() => result.current.onShownFailed({ status: 502 }));
  expect(result.current.url).toBeNull();
  expect(result.current.failure).toEqual({ hash: "c", status: 502 });
  act(() => result.current.retry());
  expect(result.current.url).toContain("/api/assets/c");
});

it("a manual target change mid-download re-keys readiness", () => {
  const { result, rerender } = renderHook(({ t }) => useProgressiveLod(chain, t), { initialProps: { t: 0 } });
  act(() => result.current.onWarmReady());
  expect(result.current.shown?.lod).toBe(0);
  rerender({ t: 1 });
  expect(result.current.shown?.lod).toBe(2);
  expect(result.current.warmUrl).toContain("/api/assets/b");
});

it("resolves urls through urlOf", () => {
  const { result } = renderHook(() => useProgressiveLod(chain, 0, (a) => `blob:${a.hash}`));
  expect(result.current.url).toBe("blob:c");
});
```

`use-lod-download.spec.tsx`:

```tsx
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useLodDownload } from "./use-lod-download";

const streamOf = (chunks: Uint8Array[]) =>
  new ReadableStream({ start(c) { for (const ch of chunks) c.enqueue(ch); c.close(); } });

describe("useLodDownload", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("streams the bytes, reports progress and ends with a blob url", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(streamOf([new Uint8Array(3), new Uint8Array(2)]), { status: 200 })));
    vi.stubGlobal("URL", { ...URL, createObjectURL: vi.fn(() => "blob:x"), revokeObjectURL: vi.fn() });
    const { result, unmount } = renderHook(() => useLodDownload({ lod: 0, hash: "a", size: 5 }));
    await waitFor(() => expect(result.current.blobUrl).toBe("blob:x"));
    expect(result.current.received).toBe(5);
    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:x");
  });

  it("reports the status of a refused download", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 502 })));
    const { result } = renderHook(() => useLodDownload({ lod: 0, hash: "a", size: 5 }));
    await waitFor(() => expect(result.current.failed).toEqual({ status: 502 }));
  });

  it("does nothing for null", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const { result } = renderHook(() => useLodDownload(null));
    expect(result.current).toEqual({ blobUrl: null, received: 0, failed: null });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run red**

Run: `yarn vitest run src/features/lod`
Expected: FAIL — modules missing.

- [ ] **Step 3: Implement**

`lod-progress.ts`:

```ts
import type { LodArtifact } from "@/entities/scene";

const mb = (bytes: number) => (bytes / 1_000_000).toFixed(1);

/** The loading chip's numbers: percent of the target and megabytes so far over its size. */
export function lodProgress(received: number, total: number): { percent: number; text: string } {
  if (total <= 0) return { percent: 0, text: `${mb(received)} MB` };
  return { percent: Math.min(100, Math.round((received / total) * 100)), text: `${mb(received)} / ${mb(total)} MB` };
}

export type LodFailure = { hash: string; status: number | null };

export type ViewerError = {
  lod: number;
  status: number | null;
  /** The file name the mock prints: `{slug}-lod{n}.glb`. */
  file: string;
  /** The next coarser level still in the chain, offered as the way out; null when there is none. */
  coarser: LodArtifact | null;
};

/** What the error card says when the level on screen failed. */
export function viewerError(failure: LodFailure | null, chain: LodArtifact[], target: LodArtifact | null, slug: string): ViewerError | null {
  if (!failure || !target) return null;
  const coarser = chain.filter((a) => a.lod > target.lod).sort((a, b) => b.lod - a.lod)[0] ?? null;
  return { lod: target.lod, status: failure.status, file: `${slug}-lod${target.lod}.glb`, coarser };
}
```

`use-progressive-lod.ts` — start from the old file and change:

```ts
import { useState } from "react";
import { assetUrl } from "@/entities/content";
import { pickLod, selectProgressive, type LodArtifact } from "@/entities/scene";
import type { LodFailure } from "./lod-progress";

export const lodUrl = (a: LodArtifact): string => assetUrl(a.hash);

export type ProgressiveLod = {
  url: string | null;
  warmUrl: string | null;
  shown: LodArtifact | null;
  target: LodArtifact | null;
  failure: LodFailure | null;
  onWarmReady: () => void;
  /** The higher level could not be fetched: drop it and stay coarse (the old ladder). */
  onWarmFailed: () => void;
  /** The level on screen threw: nothing is drawn until retry — the page shows the error card. */
  onShownFailed: (err: { status?: number | null }) => void;
  retry: () => void;
};

export function useProgressiveLod(chain: LodArtifact[], targetLod = 0, urlOf: (a: LodArtifact) => string = lodUrl): ProgressiveLod {
  const [readyHash, setReadyHash] = useState<string | null>(null);
  const [broken, setBroken] = useState<readonly string[]>([]);
  const [failure, setFailure] = useState<LodFailure | null>(null);

  // (keep the old file's comment on why nothing is memoised here)
  const available = chain.filter((a) => !broken.includes(a.hash));
  const target = pickLod(available, targetLod);
  const ready = target !== null && readyHash === target.hash;
  const { show, warm } = selectProgressive(available, targetLod, ready);
  const targetHash = target?.hash ?? null;

  return {
    url: show && !failure ? urlOf(show) : null,
    warmUrl: warm && !failure ? urlOf(warm) : null,
    shown: failure ? null : show,
    target,
    failure,
    onWarmReady: () => setReadyHash(targetHash),
    onWarmFailed: () => {
      const hash = warm?.hash;
      if (hash) setBroken((prev) => (prev.includes(hash) ? prev : [...prev, hash]));
    },
    onShownFailed: (err) => {
      if (show) setFailure({ hash: show.hash, status: err.status ?? null });
    },
    retry: () => { setFailure(null); setBroken([]); setReadyHash(null); },
  };
}
```

`use-lod-download.ts`:

```ts
import { useEffect, useState } from "react";
import { assetUrl } from "@/entities/content";
import type { LodArtifact } from "@/entities/scene";

export type LodDownload = { blobUrl: string | null; received: number; failed: { status: number | null } | null };

const IDLE: LodDownload = { blobUrl: null, received: 0, failed: null };

/**
 * Fetches one level with a streamed body so the page can draw real progress —
 * drei's loader exposes none. The blob URL is what useGLTF then parses (and
 * caches by), so the bytes travel once. Revoked when the level changes or the
 * caller unmounts; drei's parsed cache survives the revoke.
 */
export function useLodDownload(artifact: LodArtifact | null): LodDownload {
  const [state, setState] = useState<LodDownload>(IDLE);
  const hash = artifact?.hash ?? null;

  useEffect(() => {
    if (!hash) return;
    const controller = new AbortController();
    let url: string | null = null;
    setState(IDLE);
    (async () => {
      try {
        const res = await fetch(assetUrl(hash), { signal: controller.signal, credentials: "same-origin" });
        if (!res.ok || !res.body) { setState({ ...IDLE, failed: { status: res.status } }); return; }
        const reader = res.body.getReader();
        const chunks: Uint8Array[] = [];
        let received = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          received += value.byteLength;
          setState({ blobUrl: null, received, failed: null });
        }
        url = URL.createObjectURL(new Blob(chunks, { type: "model/gltf-binary" }));
        setState({ blobUrl: url, received, failed: null });
      } catch (err) {
        if ((err as { name?: string }).name !== "AbortError") setState({ ...IDLE, failed: { status: null } });
      }
    })();
    return () => {
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [hash]);

  return state;
}
```

(`setState` per chunk on a 10 MB file is a few hundred renders; the page
only re-renders the chip. If a profile shows it matters, throttle to one
update per 100 ms — `ponytail:` note it, do not build it now.)

Barrel: export the three hooks/functions and the types.

- [ ] **Step 4: Run green + gate**

Run: `yarn vitest run src/features/lod && yarn lint`

- [ ] **Step 5: Commit**

```bash
git add frontend-v2/src/features/lod
git commit --no-verify -m "feat(frontend-v2): features/lod — progressive loading with a manual target, a streamed download with progress, and the error card's facts

Frontend-only; the backend gate is skipped — no Go code changed.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git show --numstat --format="" HEAD | awk '{print $3}'
```

---

### Task 8: `entities/placement` — the gateway, the groups, the rows; `features/placements-editor`

**Files:**
- Create: `src/entities/placement/api/placements-gateway.ts` (+ `.spec.ts`) — port of `frontend/src/placement/infrastructure/placement-gateway.ts` and its spec (minus `listPlacements` and `setPlacementVisibility` — A does not call them)
- Create: `src/entities/placement/model/mutation-state.ts` (+ `.spec.ts`) — verbatim port
- Create: `src/entities/placement/model/groups.ts` (+ `.spec.ts`)
- Create: `src/entities/placement/ui/group-row.tsx` (+ `.spec.tsx`), `src/entities/placement/ui/instance-row.tsx` (+ `.spec.tsx`)
- Delete: `src/entities/placement/ui/object-row.tsx` (+ spec), `src/widgets/objects-panel/`
- Modify: `src/entities/placement/index.ts`, `src/entities/placement/placement.fixture.tsx`
- Create: `src/features/placements-editor/model/use-placements-editor.ts` (+ `.spec.tsx`) — port of `frontend/src/placement/application/use-placements-editor.ts`
- Create: `src/features/placements-editor/index.ts`

**Interfaces:**
- Produces:
  - `createPlacement(slug, body: PlacementCreate)`, `updatePlacement(slug, id, body: PlacementUpdate)`, `deletePlacement(slug, id)` — as the old gateway, on `@/shared/api`.
  - `MutationState`, `idle`, `creating`, `mutating(id)`, `isCreating`, `isMutatingId` — verbatim.
  - `type PlacementGroup = { model: { slug: string; title: string }; instances: PlacementInstance[] }`, `type PlacementInstance = { id: number; index: number; label: string }`.
  - `groupByModel(placements: Placement[], options: { slug: string; title: string }[]): PlacementGroup[]` — groups sorted by title (locale), instances by `id` ascending; `index` is 1-based within the group; a placement whose model is not among the options gets a group titled by its slug.
  - `instanceName(group, instance) → "storage-tank-500 #2"`; `instanceLine(instance) → "#2 · Tank 4, north row"` or `"#2"`.
  - `groupLine(group, selectedId) → "3 instances · #2 selected"` / `"12 instances"` / `"1 instance"`.
  - `realWorldScale(option: { bboxMin?: Vec3; bboxMax?: Vec3 } | undefined, territoryMaxDim: number): number` — the old `realWorldRatio` over one option; `DEFAULT_SCALE = 0.1`.
  - `matchesObjects(group, query) → boolean` — title, slug or any instance label contains the query (case-insensitive).
  - `GroupRow({ group; expanded; selectedId; onToggle })` — a `<button aria-expanded>` row: title, `groupLine`, chevron.
  - `InstanceRow({ group; instance; selected; pending; canWrite; canDelete; onSelect(id); onRename(id); onDelete(id); onFocus(id) })` — `aria-pressed={selected}` select button labelled `instanceName`; `Rename {name}` / `Delete {name}` icon buttons by grant; `Focus {name}` text button when neither grant.
  - `usePlacementsEditor({ slug, initial: ResolvedPlacement[], options: ModelOption[], territoryMaxDim, onChanged }) → { placements, mutation, pendingIds, create(modelSlug, count) → Promise<number | null>, placing: { done: number; total: number } | null, update(id, body), rename(id, label), remove(id), commitTransform(id, transform) }`. `create` resolves to the last created id (the page selects it). `onChanged()` is called after every successful mutation (the page invalidates `sceneQuery`).

- [ ] **Step 1: Port the gateway and `mutation-state` with their specs**

Copy, re-point imports (`@/shared/infrastructure/http/client` →
`@/shared/api`; `@/shared/infrastructure/api/dto` → `@/shared/api/dto`;
domain types → `../model/placement`). Drop `listPlacements` and
`setPlacementVisibility` and their spec cases. `mapPlacement` here must
equal `toPlacement` in `entities/scene/api/scene-gateway.ts`: move it to
`src/entities/placement/api/to-placement.ts` (+ spec) and import it from
both — one mapper, two callers.

- [ ] **Step 2: Write the failing groups spec** (`groups.spec.ts`)

```ts
import { describe, expect, it } from "vitest";
import { DEFAULT_SCALE, groupByModel, groupLine, instanceLine, instanceName, matchesObjects, realWorldScale } from "./groups";
import { IDENTITY_TRANSFORM, type Placement } from "./placement";

const p = (id: number, modelSlug: string, label = ""): Placement =>
  ({ id, territorySlug: "t", modelSlug, label, updatedAt: "", visiblePanoramaIds: [], ...IDENTITY_TRANSFORM });
const options = [{ slug: "tank", title: "storage-tank-500" }, { slug: "pump", title: "Насос НМ-1250" }];

describe("groupByModel", () => {
  it("groups by model, titles sorted, instances numbered by id order", () => {
    const groups = groupByModel([p(9, "pump"), p(3, "tank", "Tank 3"), p(1, "tank"), p(5, "pump")], options);
    expect(groups.map((g) => g.model.title)).toEqual(["storage-tank-500", "Насос НМ-1250"]);
    expect(groups[0].instances).toEqual([{ id: 1, index: 1, label: "" }, { id: 3, index: 2, label: "Tank 3" }]);
    expect(groups[1].instances.map((i) => i.id)).toEqual([5, 9]);
  });
  it("keeps a placement whose model is unknown, titled by its slug", () => {
    expect(groupByModel([p(1, "gone")], options)[0].model).toEqual({ slug: "gone", title: "gone" });
  });
  it("is empty for no placements", () => {
    expect(groupByModel([], options)).toEqual([]);
  });
});

describe("names and lines", () => {
  const group = groupByModel([p(1, "tank"), p(3, "tank", "Tank 3")], options)[0];
  it("names an instance after its model and number", () => {
    expect(instanceName(group, group.instances[1])).toBe("storage-tank-500 #2");
  });
  it("prints the number, then the label when there is one", () => {
    expect(instanceLine(group.instances[0])).toBe("#1");
    expect(instanceLine(group.instances[1])).toBe("#2 · Tank 3");
  });
  it("counts instances and names the selected one", () => {
    expect(groupLine(group, null)).toBe("2 instances");
    expect(groupLine(group, 3)).toBe("2 instances · #2 selected");
    expect(groupLine({ ...group, instances: [group.instances[0]] }, null)).toBe("1 instance");
  });
  it("matches by title, slug or an instance label", () => {
    expect(matchesObjects(group, "TANK 3")).toBe(true);
    expect(matchesObjects(group, "storage")).toBe(true);
    expect(matchesObjects(group, "pump")).toBe(false);
    expect(matchesObjects(group, "")).toBe(true);
  });
});

describe("realWorldScale", () => {
  it("is the model's longest side over the territory's", () => {
    expect(realWorldScale({ bboxMin: { x: 0, y: 0, z: 0 }, bboxMax: { x: 4, y: 2, z: 1 } }, 40)).toBe(0.1);
    expect(realWorldScale({ bboxMin: { x: 0, y: 0, z: 0 }, bboxMax: { x: 8, y: 2, z: 1 } }, 40)).toBe(0.2);
  });
  it("falls back to the default without a bbox on either side", () => {
    expect(realWorldScale(undefined, 40)).toBe(DEFAULT_SCALE);
    expect(realWorldScale({ bboxMin: { x: 0, y: 0, z: 0 }, bboxMax: { x: 4, y: 2, z: 1 } }, 0)).toBe(DEFAULT_SCALE);
    expect(realWorldScale({}, 40)).toBe(DEFAULT_SCALE);
  });
});
```

- [ ] **Step 3: Run red, implement `groups.ts`**

```ts
import type { Placement, Vec3 } from "./placement";

export type PlacementInstance = { id: number; index: number; label: string };
export type PlacementGroup = { model: { slug: string; title: string }; instances: PlacementInstance[] };

/** The panel's list: one row per model, its instances numbered by creation (id) order. */
export function groupByModel(placements: Placement[], options: { slug: string; title: string }[]): PlacementGroup[] {
  const titles = new Map(options.map((o) => [o.slug, o.title]));
  const bySlug = new Map<string, Placement[]>();
  for (const p of placements) bySlug.set(p.modelSlug, [...(bySlug.get(p.modelSlug) ?? []), p]);
  return [...bySlug.entries()]
    .map(([slug, list]) => ({
      model: { slug, title: titles.get(slug) ?? slug },
      instances: [...list].sort((a, b) => a.id - b.id).map((p, i) => ({ id: p.id, index: i + 1, label: p.label })),
    }))
    .sort((a, b) => a.model.title.localeCompare(b.model.title));
}

export const instanceName = (group: PlacementGroup, instance: PlacementInstance) =>
  `${group.model.title} #${instance.index}`;

export const instanceLine = (instance: PlacementInstance) =>
  instance.label ? `#${instance.index} · ${instance.label}` : `#${instance.index}`;

export function groupLine(group: PlacementGroup, selectedId: number | null): string {
  const n = group.instances.length;
  const count = `${n} ${n === 1 ? "instance" : "instances"}`;
  const selected = group.instances.find((i) => i.id === selectedId);
  return selected ? `${count} · #${selected.index} selected` : count;
}

export function matchesObjects(group: PlacementGroup, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    group.model.title.toLowerCase().includes(q) ||
    group.model.slug.toLowerCase().includes(q) ||
    group.instances.some((i) => i.label.toLowerCase().includes(q))
  );
}

export const DEFAULT_SCALE = 0.1;

/**
 * Both GLBs are normalised to max-axis 2, so scale 1 draws a model as big as
 * the territory. The source bboxes give the real ratio; without one, a small default.
 */
export function realWorldScale(option: { bboxMin?: Vec3; bboxMax?: Vec3 } | undefined, territoryMaxDim: number): number {
  if (territoryMaxDim <= 0 || !option?.bboxMin || !option.bboxMax) return DEFAULT_SCALE;
  const { bboxMin: a, bboxMax: b } = option;
  const modelMax = Math.max(b.x - a.x, b.y - a.y, b.z - a.z);
  return modelMax > 0 ? modelMax / territoryMaxDim : DEFAULT_SCALE;
}
```

- [ ] **Step 4: Write the failing row specs**

`group-row.spec.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { GroupRow } from "./group-row";

const group = { model: { slug: "tank", title: "storage-tank-500" }, instances: [{ id: 1, index: 1, label: "" }, { id: 2, index: 2, label: "" }, { id: 3, index: 3, label: "" }] };

describe("GroupRow", () => {
  it("is an expandable button naming the model and its count", async () => {
    const onToggle = vi.fn();
    render(<GroupRow group={group} expanded={false} selectedId={2} onToggle={onToggle} />);
    const row = screen.getByRole("button", { name: "storage-tank-500" });
    expect(row).toHaveAttribute("aria-expanded", "false");
    expect(row).toHaveTextContent("3 instances · #2 selected");
    await userEvent.click(row);
    expect(onToggle).toHaveBeenCalledOnce();
  });
  it("reads as current while one of its instances is selected", () => {
    render(<GroupRow group={group} expanded selectedId={2} onToggle={vi.fn()} />);
    expect(screen.getByRole("button", { name: "storage-tank-500" })).toHaveAttribute("aria-current", "true");
  });
});
```

`instance-row.spec.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { InstanceRow } from "./instance-row";

const group = { model: { slug: "tank", title: "storage-tank-500" }, instances: [{ id: 2, index: 2, label: "Tank 2" }] };
const instance = group.instances[0];
const handlers = () => ({ onSelect: vi.fn(), onRename: vi.fn(), onDelete: vi.fn(), onFocus: vi.fn() });

describe("InstanceRow", () => {
  it("selects by its name and reports the pressed state", async () => {
    const h = handlers();
    render(<InstanceRow group={group} instance={instance} selected={false} pending={false} canWrite canDelete {...h} />);
    await userEvent.click(screen.getByRole("button", { name: "storage-tank-500 #2" }));
    expect(h.onSelect).toHaveBeenCalledWith(2);
    expect(screen.getByRole("button", { name: "storage-tank-500 #2" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("#2 · Tank 2")).toBeInTheDocument();
  });
  it("offers Rename and Delete by grant, named after the instance", async () => {
    const h = handlers();
    render(<InstanceRow group={group} instance={instance} selected pending={false} canWrite canDelete {...h} />);
    await userEvent.click(screen.getByRole("button", { name: "Rename storage-tank-500 #2" }));
    await userEvent.click(screen.getByRole("button", { name: "Delete storage-tank-500 #2" }));
    expect(h.onRename).toHaveBeenCalledWith(2);
    expect(h.onDelete).toHaveBeenCalledWith(2);
  });
  it("hides Delete without the delete grant, and both without write", () => {
    const { rerender } = render(<InstanceRow group={group} instance={instance} selected={false} pending={false} canWrite canDelete={false} {...handlers()} />);
    expect(screen.queryByRole("button", { name: /^Delete/ })).toBeNull();
    expect(screen.getByRole("button", { name: /^Rename/ })).toBeInTheDocument();
    rerender(<InstanceRow group={group} instance={instance} selected={false} pending={false} canWrite={false} canDelete={false} {...handlers()} />);
    expect(screen.queryByRole("button", { name: /^Rename/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Focus storage-tank-500 #2" })).toBeInTheDocument();
  });
  it("waits while a mutation is in flight", () => {
    render(<InstanceRow group={group} instance={instance} selected pending canWrite canDelete {...handlers()} />);
    expect(screen.getByRole("button", { name: "Delete storage-tank-500 #2" })).toBeDisabled();
  });
});
```

- [ ] **Step 5: Run red, implement the rows**

`group-row.tsx` (mock: row `flex items-center gap-[9px] rounded-[9px]
border px-[11px] py-[9px]`; idle `border-line bg-panel-2`; with a selected
instance `border-accent bg-accent-soft`; title `font-mono text-[11px]
truncate`; sub `mt-[3px] font-mono text-[9px] text-muted`; chevron
`chevron-right` 12, rotated 90° when expanded):

```tsx
import { clsx as cx } from "clsx";
import { Icon } from "@/shared/ui/icon";
import { groupLine, type PlacementGroup } from "../model/groups";

export type GroupRowProps = { group: PlacementGroup; expanded: boolean; selectedId: number | null; onToggle: () => void };

/** One model's row: its title, how many are placed, which one is selected; opens into its instances. */
export function GroupRow({ group, expanded, selectedId, onToggle }: GroupRowProps) {
  const holdsSelection = group.instances.some((i) => i.id === selectedId);
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      aria-current={holdsSelection || undefined}
      aria-label={group.model.title}
      className={cx(
        "flex w-full cursor-pointer items-center gap-[9px] rounded-[9px] border px-[11px] py-[9px] text-left transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent",
        holdsSelection ? "border-accent bg-accent-soft" : "border-line bg-panel-2 hover:border-line-2",
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate font-mono text-[11px] text-fg">{group.model.title}</span>
        <span className="mt-[3px] block font-mono text-[9px] text-muted">{groupLine(group, selectedId)}</span>
      </span>
      <Icon name="chevron-right" size={12} className={cx("shrink-0 text-muted transition-transform duration-150", expanded && "rotate-90")} />
    </button>
  );
}
```

`instance-row.tsx` (row `flex items-center gap-2 rounded-[7px] border
px-[9px] py-[7px] ml-3` — the 12 px indent is the nesting; selected
`border-accent bg-accent-soft`, idle `border-line bg-panel`; name button
`font-mono text-[10px]`; icon buttons `size-6 rounded-[6px] border
border-line-2 bg-panel`, Delete on the selected row `border-bad bg-bad-soft
text-bad`; Focus `rounded-[7px] border border-line-2 bg-panel px-2.5 py-1
font-mono text-[10px]`):

```tsx
import { clsx as cx } from "clsx";
import { Icon } from "@/shared/ui/icon";
import { instanceLine, instanceName, type PlacementGroup, type PlacementInstance } from "../model/groups";

export type InstanceRowProps = {
  group: PlacementGroup;
  instance: PlacementInstance;
  selected: boolean;
  pending: boolean;
  canWrite: boolean;
  canDelete: boolean;
  onSelect: (id: number) => void;
  onRename: (id: number) => void;
  onDelete: (id: number) => void;
  onFocus: (id: number) => void;
};

const ICON_BUTTON =
  "flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-[6px] border transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50";

/** One placed instance under its model: select by name; rename, delete or focus by grant. */
export function InstanceRow({ group, instance, selected, pending, canWrite, canDelete, onSelect, onRename, onDelete, onFocus }: InstanceRowProps) {
  const name = instanceName(group, instance);
  const editor = canWrite || canDelete;
  return (
    <div className={cx("ml-3 flex items-center gap-2 rounded-[7px] border px-[9px] py-[7px]", selected ? "border-accent bg-accent-soft" : "border-line bg-panel")}>
      <button
        type="button"
        onClick={() => onSelect(instance.id)}
        aria-pressed={selected}
        aria-label={name}
        className={cx("min-w-0 flex-1 cursor-pointer truncate border-none bg-transparent p-0 text-left font-mono text-[10px] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent", selected ? "text-accent" : "text-fg")}
      >
        {instanceLine(instance)}
      </button>
      {canWrite ? (
        <button type="button" onClick={() => onRename(instance.id)} disabled={pending} aria-label={`Rename ${name}`} title={`Rename ${name}`} className={cx(ICON_BUTTON, "border-line-2 bg-panel text-fg hover:border-accent-line")}>
          <Icon name="pencil" size={12} />
        </button>
      ) : null}
      {canDelete ? (
        <button type="button" onClick={() => onDelete(instance.id)} disabled={pending} aria-label={`Delete ${name}`} title={`Delete ${name}`} className={cx(ICON_BUTTON, selected ? "border-bad bg-bad-soft text-bad" : "border-line-2 bg-panel text-muted hover:text-bad")}>
          <Icon name="trash" size={12} />
        </button>
      ) : null}
      {!editor ? (
        <button type="button" onClick={() => onFocus(instance.id)} aria-label={`Focus ${name}`} title={`Focus camera on ${name}`} className="shrink-0 cursor-pointer rounded-[7px] border border-line-2 bg-panel px-2.5 py-1 font-mono text-[10px] text-fg hover:border-accent-line focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent">
          Focus
        </button>
      ) : null}
    </div>
  );
}
```

Delete `object-row.tsx` + spec and `widgets/objects-panel/`; rewrite
`entities/placement/placement.fixture.tsx` to render a `GroupRow` (both
states) and `InstanceRow` (editor selected, editor idle, write-only, guest,
pending). Update the barrel.

- [ ] **Step 6: Write the failing editor spec** (`use-placements-editor.spec.tsx`)

Port the shape of the old hook's behaviour into a `renderHook` spec with
`vi.mock("@/entities/placement", async (orig) => ({ ...(await orig()), createPlacement: vi.fn(), updatePlacement: vi.fn(), deletePlacement: vi.fn() }))`:

```tsx
it("creates N instances in a row along X at the real-world scale, reports progress, and resolves to the last id", async () => {
  vi.mocked(createPlacement).mockImplementation(async (_slug, body) => ({ ...placement(100 + (body.position?.x ?? 0)), ...body }));
  const onChanged = vi.fn();
  const { result } = renderHook(() => usePlacementsEditor({ slug: "t", initial: [], options, territoryMaxDim: 40, onChanged }));
  let last: number | null = null;
  await act(async () => { last = await result.current.create("tank", 2); });
  expect(vi.mocked(createPlacement).mock.calls.map(([, b]) => b.position?.x)).toEqual([0, 0.22]);
  expect(vi.mocked(createPlacement).mock.calls[0][1].scale).toEqual({ x: 0.1, y: 0.1, z: 0.1 });
  expect(result.current.placements).toHaveLength(2);
  expect(last).toBe(result.current.placements[1].id);
  expect(onChanged).toHaveBeenCalledOnce();
});

it("exposes placing progress while the loop runs", async () => { /* resolve the first POST by hand, assert placing = { done: 1, total: 2 } */ });

it("a refused create toasts and leaves the list as it was", async () => { /* HttpError 403 → notify.error called, placements unchanged, create resolves null */ });

it("commitTransform keeps the label; rename keeps the transform", async () => { /* assert the PUT bodies */ });

it("remove drops the row and clears its pending mark", async () => { /* ... */ });
```

Write each of the five out in full — the old hook has no spec, so this is
the first one it gets.

- [ ] **Step 7: Run red, port the hook**

Start from the old file. Changes: the signature becomes one params object;
`resolve` joins `chain` from `options` (`ModelOption.chain`);
`realWorldRatio` → `realWorldScale(options.find(...), territoryMaxDim)`;
`create` tracks `placing` state (`{ done, total }`, null when idle) and
returns the last id; `notify` → `@/shared/lib/notify`; `formatError` →
`messageOf` from `@/shared/api`; drop `setVisibility`, `refresh` (A has no
list endpoint in use — on a failed delete, call `onChanged()` so the page
refetches the bundle); drop `selectedId`/`mode` (they live in
`features/viewer-mode` now); add `pendingIds` derived from `mutation`; call
`onChanged()` after every success. The file must stay under 200 lines —
if it does not, move `create` into `model/create-instances.ts` (a plain
async function taking the gateway and the setters) with its own spec.

- [ ] **Step 8: Gate + commit**

Run: `yarn vitest run src/entities/placement src/features/placements-editor src/entities/scene && yarn lint`

```bash
git add frontend-v2/src/entities/placement frontend-v2/src/features/placements-editor frontend-v2/src/widgets/objects-panel frontend-v2/src/entities/scene
git commit --no-verify -m "feat(frontend-v2): placements — the gateway, groups with numbered instances, the two rows, and the editor hook

Frontend-only; the backend gate is skipped — no Go code changed.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git show --numstat --format="" HEAD | awk '{print $3}'
```

---

### Task 9: `widgets/viewer-canvas` — the three layer

Load the three.js skills named in Global Constraints before starting. Read
every old file you port before touching it; the comments in them are the
documentation of eight reviews' worth of bugs.

**Files:**
- Create under `src/widgets/viewer-canvas/three/` (ports, imports re-pointed): `gltf-loader-setup.ts`, `ktx2-init.tsx`, `glb-preloader.tsx`, `lod-error-boundary.tsx`, `lod-warmer.tsx`, `gltf-model.tsx`, `camera-rig.tsx`, `lighting.tsx`, `is-descendant.ts`, `snap-to-surface.ts`, `snap-translate.ts`, `use-gizmo-events.ts`, `scale-gizmo-patch.ts`, `placement-instance.tsx`, `placements-layer.tsx`, `measurement-layer.tsx`, `measurement-segment.tsx`, `point-marker.tsx`, `scene-canvas.tsx`; new: `focus-on.tsx`. Every one except the three exempt files gets a `.spec.tsx`.
- Create: `src/widgets/viewer-canvas/model/scene-colors.ts` (+ spec), `model/focus-box.ts` (+ spec)
- Create: `src/widgets/viewer-canvas/ui/viewer-canvas.tsx` (+ spec), `src/widgets/viewer-canvas/viewer-canvas.fixture.tsx`, `src/widgets/viewer-canvas/index.ts`
- Modify: `frontend-v2/exempt-modules.ts` — add the three setup files.

**Interfaces:**
- Produces:
  ```ts
  export type ViewerCanvasProps = {
    slug: string;
    parentLods: LodArtifact[];
    targetLod: number;
    placements: ResolvedPlacement[];
    mode: ViewerMode;
    selectedId: number | null;
    gizmo: GizmoMode;
    snap: boolean;
    canWrite: boolean;
    chains: Chain[];
    activeChainId: number | null;
    unitRatio: number;
    resetVersion: number;
    /** Instance ids to frame; a new array reference triggers a refit. */
    focusRequest: number[] | null;
    onPick: (id: number | null) => void;
    onTransformCommit: (id: number, t: PlacementTransform) => void;
    onMeasurePoint: (p: MeasurePoint) => void;
    onCloseActiveChain: () => void;
    onRemoveSegment: (chainId: number, index: number) => void;
    onRemoveChain: (chainId: number) => void;
    /** The territory's progressive state, reported outward for the chips, the switcher and the error card. */
    onLod: (report: LodReport) => void;
  };
  export type LodReport = { shown: number | null; target: number | null; percent: number | null; progressText: string | null; failure: LodFailure | null };
  ```
  - `ViewerCanvas` — `lazy()`-wrapped default export re-exported from the barrel, plus `preloadViewer(): Promise<unknown>` (the same dynamic import).
  - `readSceneColors(root: HTMLElement) → { background: string; grid: string }` — `--panel` and `--line` (the grid helper's two colours both read `--line`; `--grid` is a 4 % alpha, too faint for three's grid lines) with fallbacks `#16181b` / `#282c31`.
  - `boxOf(root: Object3D, ids: number[]) → Box3 | null` — union of the groups whose `userData.placementId` is in `ids`.

- [ ] **Step 1: Port the files**

For each file in the list: copy, then apply:
- `@/viewer/presentation/three/x` → `./x`; `@/placement/application/x` → `./x`; `@/measurement/presentation/three/x` → `./x`.
- `@/shared/domain/lod-artifact` → `@/entities/scene`; `@/shared/infrastructure/asset-url` → `@/entities/content` (`assetUrl`); `@/placement/domain/placement` → `@/entities/placement` (`ResolvedPlacement`, `PlacementTransform`; `p.lods` → `p.chain`); `@/placement/domain/gizmo-mode` → `@/features/viewer-mode` (`GizmoMode`); `@/measurement/domain/*` → `@/entities/measurement`; `@/viewer/application/use-progressive-lod` → `@/features/lod`.
- `gltf-model.tsx`: the territory now composes `useLodDownload` and the failure path:

```tsx
export default function GltfModel({ slug, lods, targetLod, raycastable, groupRef, onReport }: GltfModelProps) {
  const target = pickLod(lods, targetLod);
  const download = useLodDownload(target && lods.length > 1 ? target : null);
  const urlOf = (a: LodArtifact) => (a.hash === target?.hash && download.blobUrl ? download.blobUrl : lodUrl(a));
  const lod = useProgressiveLod(lods, targetLod, urlOf);
  // The warm level's download is what LodWarmer parses; until the blob exists there is nothing to warm.
  const warmUrl = lod.warmUrl && download.blobUrl ? download.blobUrl : null;

  useEffect(() => {
    if (download.failed) lod.onWarmFailed();
  }, [download.failed]); // eslint-disable-line react-hooks/exhaustive-deps -- onWarmFailed is a fresh closure by design (see use-progressive-lod)

  useEffect(() => {
    const p = target && lod.shown && lod.shown.hash !== target.hash ? lodProgress(download.received, target.size) : null;
    onReport({ shown: lod.shown?.lod ?? null, target: target?.lod ?? null, percent: p?.percent ?? null, progressText: p?.text ?? null, failure: lod.failure });
  }, [lod.shown, target, download.received, lod.failure, onReport]);

  if (!lod.url) return null;
  return (
    <>
      <LodErrorBoundary resetKey={lod.url} onError={(err) => lod.onShownFailed(statusOf(err))}>
        <Suspense fallback={null}>
          <GltfPrimitive url={lod.url} raycastable={raycastable} groupRef={groupRef} />
        </Suspense>
      </LodErrorBoundary>
      {warmUrl ? <LodWarmer url={warmUrl} onReady={lod.onWarmReady} /> : null}
    </>
  );
}
```

  with `statusOf(err: unknown): { status: number | null }` reading
  `(err as { response?: { status?: number }; status?: number })` — three's
  `FileLoader` throws an `HttpError` carrying `response`. `retry` and
  `targetLod` changes come from the page through props (the page holds
  `targetLod`; retry is `key`-based: the page bumps a `retryVersion` prop
  that this component passes as part of `resetKey`). Add `retryVersion:
  number` to `ViewerCanvasProps` and to `GltfModelProps`; `resetKey` becomes
  `${lod.url}#${retryVersion}` and a `useEffect` on `retryVersion` calls
  `lod.retry()`. `onReport` must be reference-stable from the page
  (`useCallback`), or this effect loops.
  `GltfModelProps` grows past its old width; if the file crosses 200 lines,
  move `GltfPrimitive` into `gltf-primitive.tsx` (+ spec).
- `placement-instance.tsx`: `useProgressiveLod(placement.chain, 0)`; a
  shown failure on a placement calls `onShownFailed` then immediately
  `retry`-less fallback: placements keep the old behaviour — on
  `LodErrorBoundary` error call `lod.onWarmFailed()` when the failing url
  is the warm one, else drop the shown hash. Simplest faithful port: keep
  the old `onFailed` semantics by adding to `useProgressiveLod` an
  `onShownDropped()` that adds the shown hash to `broken` without setting
  `failure`. Placements use `onShownDropped`; the territory uses
  `onShownFailed`. Add `onShownDropped` to Task 7's hook and a spec case
  for it in this task (the test file lives in `features/lod`; edit it
  there). Also set `group.userData.placementId = placement.id` in
  `PlacementBody`'s layout effect so `boxOf` can find it.
- `placements-layer.tsx`: `measureMode` prop → `mode !== "orbit"`
  computed by the caller; keep the prop name `measureMode: boolean`.
- `scene-canvas.tsx`: delete every panorama prop and the panorama layer,
  `CameraPositionTracker`, `handlePointerMove`, `visiblePlacements`
  (render `placements` directly), `panoramaRef`/`snapTargetRef` (snap
  targets `territoryRef`). Add `colors: { background: string; grid: string }`
  and use them: `<color attach="background" args={[colors.background]} />`,
  `<gridHelper args={[6, 24, colors.grid, colors.grid]} …/>` — keep the
  stable-reference rule by memoising the two args arrays on `colors`.
  Add `<FocusOn root={territoryRef} request={focusRequest} />` inside
  `<Bounds>`. The file was 290 lines; after the deletions it should land
  near 170. If not, move the `Canvas` props (`CAMERA`, `DPR_RANGE`,
  `GL_CONFIG`) into `three/canvas-config.ts`.
- `measurement-segment.tsx` / `point-marker.tsx`: replace the cyan
  Tailwind classes with tokens to the mock's geometry — label chip
  `rounded-[6px] border border-accent bg-panel px-2 py-1 font-mono
  text-[11px] text-accent shadow-elevation whitespace-nowrap`, hover
  `hover:border-bad hover:text-bad`; `LINE_COLOR` becomes a prop
  `lineColor` fed from `colors.accent` (add `accent` to `readSceneColors`
  and to `colors`); markers `size-3 rounded-full border-2 border-accent
  bg-panel`, the closer `size-4` with `ring-4 ring-accent-soft`.
- `gltf-loader-setup.ts`, `ktx2-init.tsx`, `glb-preloader.tsx`: verbatim
  (`p.lods` → `p.chain`).

- [ ] **Step 2: New pure modules and their specs**

`model/scene-colors.spec.ts`:

```ts
import { describe, expect, it } from "vitest";
import { readSceneColors } from "./scene-colors";

describe("readSceneColors", () => {
  it("reads the tokens off the root", () => {
    const root = document.createElement("div");
    root.style.setProperty("--panel", "#ffffff");
    root.style.setProperty("--line", "#e3e1db");
    root.style.setProperty("--accent", "#e5610a");
    document.body.append(root);
    expect(readSceneColors(root)).toEqual({ background: "#ffffff", grid: "#e3e1db", accent: "#e5610a" });
    root.remove();
  });
  it("falls back to the dark theme when the tokens are unset", () => {
    expect(readSceneColors(document.createElement("div"))).toEqual({ background: "#16181b", grid: "#282c31", accent: "#f97316" });
  });
});
```

```ts
export type SceneColors = { background: string; grid: string; accent: string };

const DARK: SceneColors = { background: "#16181b", grid: "#282c31", accent: "#f97316" };

const read = (root: HTMLElement, name: string, fallback: string) =>
  getComputedStyle(root).getPropertyValue(name).trim() || fallback;

/** three.js takes no CSS variables; the scene's three colours are read once per theme. */
export const readSceneColors = (root: HTMLElement): SceneColors => ({
  background: read(root, "--panel", DARK.background),
  grid: read(root, "--line", DARK.grid),
  accent: read(root, "--accent", DARK.accent),
});
```

`model/focus-box.spec.ts` (three's `Object3D`/`Box3` run fine in jsdom):

```ts
import { Box3, Group, Mesh, BoxGeometry } from "three";
import { describe, expect, it } from "vitest";
import { boxOf } from "./focus-box";

const instance = (id: number, x: number) => {
  const g = new Group();
  g.userData.placementId = id;
  g.position.x = x;
  g.add(new Mesh(new BoxGeometry(1, 1, 1)));
  return g;
};

describe("boxOf", () => {
  it("unions the boxes of the requested instances", () => {
    const root = new Group();
    root.add(instance(1, 0), instance(2, 10), instance(3, 50));
    const box = boxOf(root, [1, 2])!;
    expect(box.min.x).toBeCloseTo(-0.5);
    expect(box.max.x).toBeCloseTo(10.5);
  });
  it("is null when nothing matches", () => {
    expect(boxOf(new Group(), [9])).toBeNull();
  });
});
```

```ts
import { Box3, type Object3D } from "three";

/** The bounds of the named placement instances, for the camera to frame. */
export function boxOf(root: Object3D, ids: number[]): Box3 | null {
  const wanted = new Set(ids);
  const box = new Box3();
  let any = false;
  root.traverse((o) => {
    if (wanted.has(o.userData.placementId as number)) {
      box.expandByObject(o);
      any = true;
    }
  });
  return any ? box : null;
}
```

`three/focus-on.tsx`:

```tsx
import { useBounds } from "@react-three/drei";
import { useEffect, type RefObject } from "react";
import type { Object3D } from "three";
import { boxOf } from "../model/focus-box";

/** Refits drei's Bounds to a set of instances whenever a new request arrives. */
export default function FocusOn({ root, request }: { root: RefObject<Object3D | null>; request: number[] | null }) {
  const bounds = useBounds();
  useEffect(() => {
    if (!request || !root.current) return;
    const box = boxOf(root.current.parent ?? root.current, request);
    if (box) bounds.refresh(box).fit();
  }, [request, root, bounds]);
  return null;
}
```

(`root` is the territory group; the placements are its siblings under the
same wrapper `<group>`, hence `.parent`.)

- [ ] **Step 3: The DOM wrapper, the lazy entry, the fixture**

`ui/viewer-canvas.tsx`:

```tsx
import { useEffect, useState } from "react";
import { useTheme } from "@/features/theme-toggle";
import { readSceneColors, type SceneColors } from "../model/scene-colors";
import SceneCanvas from "../three/scene-canvas";
import type { ViewerCanvasProps } from "./props";

/** The scene, coloured from the tokens and re-read when the theme flips. */
export function ViewerCanvas(props: ViewerCanvasProps) {
  const { theme } = useTheme();
  const [colors, setColors] = useState<SceneColors>(() => readSceneColors(document.documentElement));
  useEffect(() => {
    setColors(readSceneColors(document.documentElement));
  }, [theme]);
  return <SceneCanvas {...props} colors={colors} />;
}
```

(If `features/theme-toggle` does not export `useTheme` from its barrel, add
the export — it is the theme's one owner.) Put `ViewerCanvasProps` and
`LodReport` in `ui/props.ts` (types only; no spec needed if the file holds
only types — check `architecture.spec`: it exempts nothing by content, so
give it a one-line spec asserting the module loads).

`index.ts`:

```ts
import { lazy } from "react";
export type { LodReport, ViewerCanvasProps } from "./ui/props";
const load = () => import("./ui/viewer-canvas").then((m) => ({ default: m.ViewerCanvas }));
/** Code-split: three and its loaders stay out of every other page's bundle. */
export const ViewerCanvas = lazy(load);
/** Warm the chunk from a catalog card before the click. */
export const preloadViewer = load;
```

`viewer-canvas.fixture.tsx`: a 700 px tall box holding `<Suspense>` +
`<ViewerCanvas>` with an empty chain (`parentLods: []`) — renders the grid
and lights, no network. Cosmos will show the themed background; that is the
measurement surface for the colour test (Step 6).

- [ ] **Step 4: Specs for the three files with `@react-three/test-renderer`**

Every ported `.tsx` under `three/` gets a spec. Pattern (mock drei's
network- and DOM-bound pieces once in a shared helper
`three/test-helpers.ts` — exempt-free because it is imported by specs only;
name it `three/test-helpers.spec-helper.ts`? No: `architecture.spec`
demands a spec for every non-spec `.ts`. Put the helpers inside
`src/shared/lib/test-setup.ts`? No — keep them local: `three/testing.ts`
with a trivial `testing.spec.ts` asserting the mocks build):

```ts
// three/testing.ts
import { Group, Mesh, BoxGeometry, MeshStandardMaterial } from "three";
import { vi } from "vitest";

export const fakeScene = () => {
  const scene = new Group();
  scene.add(new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial()));
  return scene;
};

/** drei without the network and without the DOM portals. */
export function mockDrei() {
  vi.mock("@react-three/drei", async (orig) => {
    const real = await orig<typeof import("@react-three/drei")>();
    const useGLTF = Object.assign(vi.fn(() => ({ scene: fakeScene() })), { preload: vi.fn(), setDecoderPath: vi.fn() });
    return { ...real, useGLTF, Html: () => null, Line: () => null, AdaptiveDpr: () => null, Bounds: ({ children }: { children: React.ReactNode }) => children, useBounds: () => ({ refresh: vi.fn().mockReturnThis(), fit: vi.fn() }) };
  });
}
```

`placements-layer.spec.tsx`:

```tsx
import ReactThreeTestRenderer from "@react-three/test-renderer";
import { describe, expect, it, vi } from "vitest";
import { mockDrei } from "./testing";
import PlacementsLayer from "./placements-layer";

mockDrei();

const placement = (id: number) => ({ id, territorySlug: "t", modelSlug: "m", label: "", updatedAt: "", visiblePanoramaIds: [], position: { x: id, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 }, chain: [{ lod: 0, hash: `h${id}`, size: 1 }] });

describe("PlacementsLayer", () => {
  it("mounts one clone per placement at its transform, and a gizmo only for the selection", async () => {
    const r = await ReactThreeTestRenderer.create(
      <PlacementsLayer placements={[placement(1), placement(2)]} selectedId={2} mode="translate" measureMode={false} canEdit territoryRef={{ current: null }} snapEnabled={false} onSelect={vi.fn()} onCommit={vi.fn()} />,
    );
    const groups = r.scene.findAll((n) => n.instance.userData?.placementId !== undefined);
    expect(groups.map((g) => g.instance.userData.placementId)).toEqual([1, 2]);
    expect(groups[1].instance.position.x).toBe(2);
    expect(r.scene.findAll((n) => n.instance.type === "TransformControls")).toHaveLength(1);
  });

  it("draws no gizmo without the write grant or in measure mode", async () => {
    const r = await ReactThreeTestRenderer.create(
      <PlacementsLayer placements={[placement(1)]} selectedId={1} mode="translate" measureMode canEdit territoryRef={{ current: null }} snapEnabled={false} onSelect={vi.fn()} onCommit={vi.fn()} />,
    );
    expect(r.scene.findAll((n) => n.instance.type === "TransformControls")).toHaveLength(0);
  });

  it("reports a click on an instance as a pick", async () => {
    const onSelect = vi.fn();
    const r = await ReactThreeTestRenderer.create(
      <PlacementsLayer placements={[placement(1)]} selectedId={null} mode="translate" measureMode={false} canEdit territoryRef={{ current: null }} snapEnabled={false} onSelect={onSelect} onCommit={vi.fn()} />,
    );
    const group = r.scene.findAll((n) => n.instance.userData?.placementId === 1)[0];
    await r.fireEvent(group, "click", { stopPropagation: vi.fn() });
    expect(onSelect).toHaveBeenCalledWith(1);
  });
});
```

If `TransformControls` refuses to mount under the test renderer (it needs
`gl.domElement`), mock it in `mockDrei` as
`TransformControls: (p) => <group name="TransformControls" {...p} />` and
find by `name` — say so in the report. The same spec shape covers:
`gltf-model.spec.tsx` (coarse first: with `chain=[lod0, lod2]` the
`useGLTF` mock is first called with `/api/assets/c`; after `onWarmReady`
the primitive re-mounts on the blob url — drive `useLodDownload` with a
stubbed `fetch` as in Task 7; a thrown `useGLTF` → `onReport` carries
`failure`), `lod-warmer.spec.tsx` (fires `onReady` once per url),
`lod-error-boundary.spec.tsx` (plain RTL: a throwing child → `onError`,
`resetKey` re-arms), `measurement-layer.spec.tsx` (N segments + N markers
per chain; the closer only on the active chain's first point),
`measurement-segment.spec.tsx` / `point-marker.spec.tsx` (render the `Html`
children by *not* mocking `Html` in these two — drei's `Html` renders a
portal into `document.body` under jsdom; assert the label text and the
`Close measurement chain` button), `camera-rig.spec.tsx` (constructs
`OrbitControls` on the renderer's `gl.domElement` — the test renderer
provides a stub canvas; assert `set({ controls })` by reading
`r.getInstance()`? Simpler: spy on `OrbitControls.prototype.reset` and bump
`resetVersion`), `lighting.spec.tsx` (three lights), `focus-on.spec.tsx`
(`useBounds().refresh` called with a `Box3` on a new request, not on the
same reference), `is-descendant`, `snap-to-surface` (a flat
`PlaneGeometry` mesh at y=0.5 → `raycastSurfaceY` answers 0.5), `snap-translate`
(port the old spec), `use-gizmo-events.spec.tsx` (mount inside the test
renderer with a fake emitter object as `tcRef.current`; emit
`dragging-changed {value:false}` → `onCommit` with the object's transform;
`objectChange` in scale mode clamps to uniform ≥ 0.01), `scale-gizmo-patch.spec.ts`
(a fake `tc` with `gizmo.gizmo.scale.children` named `XYZX`/`XYZY`; after
`updateMatrixWorld` only `XYZX` stays visible; the teardown restores),
`scene-canvas.spec.tsx` (mounts with an empty chain: background colour
equals `colors.background`, grid present; an `onPointerMissed` in orbit
mode → `onPick(null)`, in measure mode → nothing), `viewer-canvas.spec.tsx`
(RTL: mock `./three/scene-canvas` to capture `colors`; set `--panel` on
`documentElement`, render, assert; flip the theme through the mocked
`useTheme` and assert the re-read).

- [ ] **Step 5: Exempt the three setup files**

Append to `exempt-modules.ts`:

```ts
  // three.js setup that only runs against a real WebGL context or a Worker:
  // the Draco/KTX2/BVH prototype patches, the render-time detectSupport
  // probe, and drei's cache warmer. Their behaviour is checked by the live
  // pass (a KTX2-textured territory renders textured, not white).
  "src/widgets/viewer-canvas/three/gltf-loader-setup.ts",
  "src/widgets/viewer-canvas/three/ktx2-init.tsx",
  "src/widgets/viewer-canvas/three/glb-preloader.tsx",
```

- [ ] **Step 6: Gate, then the colour measurement**

Run: `yarn vitest run src/widgets/viewer-canvas src/features/lod && yarn lint && yarn test:coverage`
Expected: green; coverage above thresholds (the three files are large —
if branches dip under 85, the missing cases are in `use-gizmo-events` and
`scene-canvas`; add them, do not exempt).

Cosmos: open the widget fixture in both themes; with Playwright read the
canvas's clear colour by screenshotting a 1×1 region at the centre and
comparing to `--panel` (`#16181b` dark / `#ffffff` light) — say which
pixel you read.

- [ ] **Step 7: Commit**

```bash
git add frontend-v2/src/widgets/viewer-canvas frontend-v2/src/features frontend-v2/exempt-modules.ts
git commit --no-verify -m "feat(frontend-v2): widgets/viewer-canvas — the three layer ported, coloured from the tokens, with focus, progress and the shown-level failure reported outward

Frontend-only; the backend gate is skipped — no Go code changed.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git show --numstat --format="" HEAD | awk '{print $3}'
```

---

### Task 10: `widgets/overlays-panel` — the aside, the tabs, the collapse

**Files:**
- Create: `src/widgets/overlays-panel/model/use-overlays-panel.ts` (+ `.spec.tsx`) — port of `frontend/src/viewer/application/use-overlays-panel.ts`
- Create: `src/widgets/overlays-panel/ui/overlays-panel.tsx` (+ `.spec.tsx`)
- Create: `src/widgets/overlays-panel/overlays-panel.fixture.tsx`, `src/widgets/overlays-panel/index.ts`

**Interfaces:**
- Produces:
  - `type OverlaysTab = "view" | "placements"`.
  - `useOverlaysPanel(selectedId, forcedTab, forceExpanded) → { tab, collapsed, setTab, setCollapsed }` — as the old hook, plus `collapsed` persisted under `localStorage["andrey.overlays"]` (`"collapsed"` | absent) in try/catch.
  - `OverlaysPanel({ tab; onTabChange; collapsed; onCollapsedChange; placementsCount; view: ReactNode; placements: ReactNode })` — collapsed → `<CollapsedRail label="Overlays" badge={`${n} placed`} expandName="Expand Overlays panel" />`; open → `<aside aria-label="Overlays">` with the head (`Overlays` overline + `Collapse Overlays panel` button), `Tabs` (`View`, `Placements (N)`), and the body slot. Sets the CSS variable `--overlays-w` (`44px` / `320px` / `300px` under 1280) on its root so the page can offset the switcher; the width itself is `w-[320px] max-[1280px]:w-[300px]`.

- [ ] **Step 1: Port the hook and write its spec**

Cases: starts on `view`, not collapsed; a selection switches to
`placements` during render; `forcedTab` overrides; `forceExpanded`
un-collapses without changing the stored choice; `setCollapsed(true)`
writes `andrey.overlays=collapsed`, `false` removes it; a throwing
`localStorage` (stub `getItem` to throw) leaves the default.

- [ ] **Step 2: Write the failing panel spec**

```tsx
describe("OverlaysPanel", () => {
  it("is a named aside with two tabs and the placements count", async () => {
    const onTabChange = vi.fn();
    render(<OverlaysPanel tab="view" onTabChange={onTabChange} collapsed={false} onCollapsedChange={vi.fn()} placementsCount={4} view={<p>view body</p>} placements={<p>placements body</p>} />);
    expect(screen.getByRole("complementary", { name: "Overlays" })).toBeInTheDocument();
    expect(screen.getByText("view body")).toBeInTheDocument();
    expect(screen.queryByText("placements body")).toBeNull();
    await userEvent.click(screen.getByRole("tab", { name: "Placements (4)" }));
    expect(onTabChange).toHaveBeenCalledWith("placements");
  });
  it("collapses into the rail and back", async () => {
    const onCollapsedChange = vi.fn();
    const { rerender } = render(<OverlaysPanel tab="view" onTabChange={vi.fn()} collapsed={false} onCollapsedChange={onCollapsedChange} placementsCount={4} view={null} placements={null} />);
    await userEvent.click(screen.getByRole("button", { name: "Collapse Overlays panel" }));
    expect(onCollapsedChange).toHaveBeenCalledWith(true);
    rerender(<OverlaysPanel tab="view" onTabChange={vi.fn()} collapsed onCollapsedChange={onCollapsedChange} placementsCount={4} view={null} placements={null} />);
    expect(screen.queryByRole("complementary")).toBeNull();
    expect(screen.getByText("4 placed")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Expand Overlays panel" }));
    expect(onCollapsedChange).toHaveBeenCalledWith(false);
  });
});
```

- [ ] **Step 3: Implement**

The panel: `aside` `absolute right-3.5 top-3.5 bottom-3.5 flex w-[320px]
max-[1280px]:w-[300px] flex-col overflow-hidden rounded-card border
border-line bg-panel shadow-elevation`; head `flex items-center
justify-between gap-2.5 border-b border-line px-3.5 py-[13px]`; overline
`font-mono text-[9px] uppercase tracking-[0.2em] text-muted`; collapse
button `size-[26px] rounded-[7px] border border-line-2 bg-panel-2 text-fg`
with `chevron-right` 13; tabs strip `flex gap-1 border-b border-line
bg-panel-2 px-2.5 py-2` — the existing `Tabs` draws underline tabs, not
the mock's filled segments; **do not** pass a className that fights it.
Add `variant="segments"` to `shared/ui/tabs` in this task (each tab
`flex-1 rounded-[7px] px-2.5 py-1.5 font-mono text-[10px] uppercase
tracking-[0.12em]`, active `bg-accent-soft font-semibold text-accent`,
idle `text-muted`; no bottom border), with a spec case and a fixture entry
— the tab roles stay. Body `flex-1 overflow-auto p-3.5`. Root wrapper sets
`style={{ "--overlays-w": collapsed ? "44px" : undefined }}` and the CSS
class `[--overlays-w:320px] max-[1280px]:[--overlays-w:300px]` when open.
Collapsed: `<CollapsedRail className="absolute right-3.5 top-3.5 bottom-3.5" …/>`.

- [ ] **Step 4: Fixture, measure, gate, commit**

Fixture: open on View, open on Placements (4), collapsed; inside a 700 px
relative box so the absolute positioning shows. Measure width 320 at a
1440 viewport and 300 at 1280, head padding 13/14, tab strip padding 8/10,
both themes.

```bash
git add frontend-v2/src/widgets/overlays-panel frontend-v2/src/shared/ui/tabs
git commit --no-verify -m "feat(frontend-v2): the Overlays panel — aside, segment tabs, the collapsed rail, and a remembered fold

Frontend-only; the backend gate is skipped — no Go code changed.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git show --numstat --format="" HEAD | awk '{print $3}'
```

---

### Task 11: `widgets/placements-panel` — search, groups, the selected block, the create form, the empty state

**Files:**
- Create: `src/widgets/placements-panel/ui/placements-panel.tsx` (+ `.spec.tsx`)
- Create: `src/widgets/placements-panel/ui/selected-block.tsx` (+ `.spec.tsx`)
- Create: `src/widgets/placements-panel/model/panel-copy.ts` (+ `.spec.ts`)
- Create: `src/widgets/placements-panel/placements-panel.fixture.tsx`, `src/widgets/placements-panel/index.ts`

**Interfaces:**
- Produces:
  ```ts
  export type PlacementsPanelProps = {
    groups: PlacementGroup[];
    query: string; onQuery: (q: string) => void;
    expandedModel: string | null; onToggleGroup: (slug: string) => void;
    selectedId: number | null; onSelect: (id: number | null) => void;
    pendingIds: number[];
    grants: { create: boolean; write: boolean; delete: boolean };
    onAdd: () => void;              // opens the picker
    onRename: (id: number) => void; // opens the form in rename mode
    onDelete: (id: number) => void;
    onFocus: (id: number) => void;
    selected: SelectedBlockProps | null; // the block under the list, when something is selected
  };
  export type SelectedBlockProps = {
    name: string;                      // "storage-tank-500 #2"
    gizmo: GizmoMode; onGizmo: (g: GizmoMode) => void;
    transform: PlacementTransform;     // radians in; the block shows degrees
    snap: boolean; onSnap: (on: boolean) => void;
    canWrite: boolean;
    form: null | {                     // the create/rename form (state 14)
      kind: "new" | "rename";
      label: string; onLabel: (s: string) => void;
      transform: PlacementTransform; onTransform: (t: PlacementTransform) => void;
      saving: boolean; onSave: () => void; onCancel: () => void;
    };
    compact: boolean;                  // under 1280: "Translate T" labels
  };
  ```
  - `panelCopy` — `GUEST_FOOTER`, `NO_DELETE_FOOTER`, `EMPTY_TITLE`, `EMPTY_BODY`, `ADD_LABEL` as constants; `footerFor(grants) → string | null`.
  - `SelectedBlock`: overline `Selected` (`Selected · new` / `Selected · saving` with a form), `Segmented` `Translate (T)/Rotate (R)/Scale (S)` (`hint` unused — the mock writes the key in the label; `compact` drops the parentheses), the Pos/Rot/Scl grid, the `Switch`, and the form's `Label` `TextField` + `Save`/`Cancel`.

The grid: three `Vec3Field`s would draw three separate labelled groups
with the `x y z` prefixes — the mock draws one `auto repeat(3,1fr)` grid
with `Pos`/`Rot`/`Scl` row labels and bare right-aligned cells. That is a
different component. Add to `shared/ui/vec3-field` a `variant="grid"`
(`layout="row"`): renders `<div role="group" aria-labelledby>` with the
label as the first grid cell (`font-mono text-[9px] uppercase
tracking-[0.12em] text-muted`) and three inputs `rounded-[6px] border
border-line-2 bg-panel-2 px-[7px] py-1.5 text-right font-mono text-[11px]`
with no axis prefix (`aria-label` keeps `"{label} x"`); a `readOnly`
prop renders `<span>`s with the same box and the muted text the mock uses
for Rot/Scl. Spec cases + fixture entry in `shared/ui/vec3-field`. The
three rows then stack into one visual grid because each row is
`grid-cols-[auto_repeat(3,1fr)]` with the same first-column width — set
`min-w-[26px]` on the label cell so the three rows align.

- [ ] **Step 1: Write the failing specs**

`panel-copy.spec.ts`:

```ts
it("names the footer by what the grants leave out", () => {
  expect(footerFor({ create: false, write: false, delete: false })).toBe(GUEST_FOOTER);
  expect(footerFor({ create: true, write: true, delete: false })).toBe(NO_DELETE_FOOTER);
  expect(footerFor({ create: true, write: true, delete: true })).toBeNull();
  expect(footerFor({ create: false, write: true, delete: true })).toBeNull();
});
```

`selected-block.spec.tsx` (key cases):

```tsx
it("shows the transform in degrees and lets the gizmo mode change", async () => {
  const onGizmo = vi.fn();
  render(<SelectedBlock name="storage-tank-500 #2" gizmo="translate" onGizmo={onGizmo} transform={{ position: { x: 12.4, y: 0, z: -8.25 }, rotation: { x: 0, y: Math.PI / 2, z: 0 }, scale: { x: 1, y: 1, z: 1 } }} snap onSnap={vi.fn()} canWrite form={null} compact={false} />);
  expect(screen.getByText("storage-tank-500 #2")).toBeInTheDocument();
  expect(screen.getByRole("group", { name: "Pos" })).toHaveTextContent("12.400");
  expect(screen.getByRole("group", { name: "Rot" })).toHaveTextContent("90°");
  await userEvent.click(screen.getByRole("radio", { name: "Scale (S)" }));
  expect(onGizmo).toHaveBeenCalledWith("scale");
  expect(screen.getByRole("switch", { name: "Snap to surface" })).toHaveAttribute("aria-checked", "true");
});
it("drops the key parentheses when compact", () => {
  render(<SelectedBlock {...base} compact />);
  expect(screen.getByRole("radio", { name: "Translate T" })).toBeInTheDocument();
});
it("without the write grant the block is read-only: no segmented control, no switch", () => {
  render(<SelectedBlock {...base} canWrite={false} />);
  expect(screen.queryByRole("radiogroup")).toBeNull();
  expect(screen.queryByRole("switch")).toBeNull();
});
it("the create form edits the label and the numbers, and saves", async () => {
  const onSave = vi.fn(); const onLabel = vi.fn();
  render(<SelectedBlock {...base} form={{ kind: "new", label: "", onLabel, transform: base.transform, onTransform: vi.fn(), saving: false, onSave, onCancel: vi.fn() }} />);
  expect(screen.getByText("Selected · new")).toBeInTheDocument();
  await userEvent.type(screen.getByRole("textbox", { name: "Label" }), "T");
  expect(onLabel).toHaveBeenCalledWith("T");
  await userEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(onSave).toHaveBeenCalledOnce();
});
it("the saving form is busy and its fields wait", () => {
  render(<SelectedBlock {...base} form={{ ...form, saving: true }} />);
  expect(screen.getByText("Selected · saving")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Saving/ })).toHaveAttribute("aria-busy", "true");
  expect(screen.getByRole("textbox", { name: "Label" })).toBeDisabled();
});
```

`placements-panel.spec.tsx` (key cases): renders the search and one
`GroupRow` per group; toggling a group shows its `InstanceRow`s; a group
holding the selection is expanded even when `expandedModel` is another
(the selection wins); `Add objects to territory` only with `grants.create`;
the empty state (`No objects placed yet`, the sentence, the button by
grant) when `groups` is empty; the footer per grants; `query` filters
through `matchesObjects`; the selected block renders under the list when
`selected` is given.

- [ ] **Step 2: Run red, implement**

`placements-panel.tsx` — composition only; `flex flex-col gap-3.5`; the
search `SearchField label="Search objects" placeholder="Search objects"`;
the list `<ul aria-label="Objects" className="m-0 flex list-none flex-col
gap-1.5 p-0" role="list">` of `<li>` holding a `GroupRow` and, when
expanded, a nested `<ul role="list">` of `InstanceRow`s; the `Button`
(full width, `variant="primary"`, `Icon name="plus"`); the `SelectedBlock`
under a `border-t border-line pt-3.5`; the footer `<p className="m-0 mt-1
text-[11px] leading-[1.55] text-muted">`; the empty state is `EmptyState
layout="center"` with `icon="cube"` — `EmptyState` draws a dashed border
the mock does not; add `layout="panel"` to `EmptyState` (no border, centred
column `gap-[13px]`, a 44 px icon tile `rounded-card border border-line-2
bg-panel-2 text-dim`, `text-sm font-semibold` title, `max-w-[30ch]
text-xs leading-[1.55]` body) with a spec case and fixture entry.

`selected-block.tsx` — `Segmented tone="soft" mono` with labels
`Translate (T)`…; the grid of three `Vec3Field layout="row"` (Pos: values
to 3 dp; Rot: `toDegrees` with a `°` suffix in read-only mode, bare degrees
in the form; Scl: 3 dp); the snap row `flex items-center justify-between
gap-2.5 rounded-[8px] border border-line bg-panel-2 px-[11px] py-2` with
`<span className="font-mono text-[10px] text-fg">Snap to surface <kbd
…>G</kbd></span>` + `Switch`; the form adds a `TextField label="Label"`
above the grid and `Save` (`variant="primary" size="sm"`, `loading` when
saving, label `Saving…`) / `Cancel` (`size="sm"`) below. Under
`!canWrite` the block shows the name and the read-only grid only.

- [ ] **Step 3: Fixture, measure, gate, commit**

Fixture states: editor with a selection (state 2), guest (state 5),
write-without-delete (state 13's list, minus the visibility block), empty
(state 7), create form + saving (state 14), compact at 300 px (state 17).
Measure: row padding 9/11 and 9/10 at 300, segmented item padding 6/0,
grid cell padding 6/7 and 6/6 at 300, snap row padding 8/11, `Rot` cell
text = `--muted`. Both themes.

```bash
git add frontend-v2/src/widgets/placements-panel frontend-v2/src/shared/ui/vec3-field frontend-v2/src/shared/ui/card
git commit --no-verify -m "feat(frontend-v2): the placements panel — grouped rows, the selected block with the gizmo grid, the create form, the panel empty state

Frontend-only; the backend gate is skipped — no Go code changed.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git show --numstat --format="" HEAD | awk '{print $3}'
```

---

### Task 12: `PlaceObjectsModal` — the picker in a modal, quantity, the placing line

**Files:**
- Create: `src/widgets/model-picker/ui/place-objects-modal.tsx` (+ `.spec.tsx`)
- Modify: `src/widgets/model-picker/index.ts`, `src/widgets/model-picker/model-picker.fixture.tsx`
- Modify: `src/entities/model/ui/model-picker-card.tsx` — the sub line `{n} LODs · {size}` (add `meta?: string` prop; the card prints it under the title in `font-mono text-[9px] text-muted`), spec case, fixture entry.

**Interfaces:**
- Produces: `PlaceObjectsModal({ open; onClose; territoryTitle; options: ModelOption[]; placing: { done: number; total: number } | null; onPlace: (slug: string, count: number) => void })`. Internal state: `query`, `selectedSlug`, `count` (1..99). Title `Add objects to {territoryTitle}`; description as the mock; `SearchField` `Search the model library`; `ModelPicker` with `unavailable` for an empty chain and `meta` = `${chain.length} LODs · ${formatSize(totalSize)}`; footer left: `Quantity` overline + `QuantityStepper label={`${title} quantity`}` (its buttons then read `Decrease storage-tank-500 quantity`, unique enough; the mock's `One fewer …` is a recorded rewording) and, while `placing`, a 70×3 track with the fill at `done/total` and mono 10 accent `Placing {done} of {total}…`; footer right: `Cancel`, primary `Place {count} × {title}` (`loading` while placing; disabled with no selection).

- [ ] **Step 1: Write the failing spec**

```tsx
const options = [
  { slug: "tank", title: "storage-tank-500", chain: [{ lod: 0, hash: "a", size: 8_400_000 }, { lod: 1, hash: "b", size: 1 }, { lod: 2, hash: "c", size: 1 }] },
  { slug: "raw", title: "not-yet", chain: [] },
];

it("names the territory, lists the library with LOD counts, and greys the unconverted", () => {
  render(<PlaceObjectsModal open onClose={vi.fn()} territoryTitle="Refinery Block C" options={options} placing={null} onPlace={vi.fn()} />);
  expect(screen.getByRole("dialog", { name: "Add objects to Refinery Block C" })).toBeInTheDocument();
  expect(screen.getByText("3 LODs · 8.4 MB")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /not-yet/ })).toBeDisabled();
});
it("places N of the chosen model", async () => {
  const onPlace = vi.fn();
  render(<PlaceObjectsModal open onClose={vi.fn()} territoryTitle="T" options={options} placing={null} onPlace={onPlace} />);
  await userEvent.click(screen.getByRole("button", { name: /storage-tank-500/ }));
  await userEvent.click(screen.getByRole("button", { name: "Increase storage-tank-500 quantity" }));
  await userEvent.click(screen.getByRole("button", { name: "Place 2 × storage-tank-500" }));
  expect(onPlace).toHaveBeenCalledWith("tank", 2);
});
it("filters the library by the search", async () => { /* type "tank", only one card */ });
it("shows the placing line and keeps the primary busy", () => {
  render(<PlaceObjectsModal open onClose={vi.fn()} territoryTitle="T" options={options} placing={{ done: 1, total: 2 }} onPlace={vi.fn()} />);
  expect(screen.getByText("Placing 1 of 2…")).toBeInTheDocument();
  expect(screen.getByRole("progressbar", { name: "Placing" })).toHaveAttribute("aria-valuenow", "50");
});
it("cannot place with nothing selected", () => { /* primary disabled, label "Place 1 × …" absent → "Place" */ });
```

- [ ] **Step 2: Run red, implement**

`Modal` takes `title`, `description`, `footer`; its width is
`w-[min(28rem,…)]` — the mock wants 720. Add `size?: "md" | "lg"` to
`Modal` (`lg` → `w-[min(45rem,calc(100vw-2rem))]`), spec case, fixture
entry. The footer needs a left cluster: `Modal`'s `footer` slot is
right-aligned by `justify-end`; render your own `flex items-center
justify-between` inside it. `ModelPicker` is `grid-cols-3`; the mock is
four columns at 720 — pass `columns={4}` (add the prop, default 3; spec
case). The picker's `quantities` prop is per-model; here one `count` for
the selected slug: `quantities={{ [selectedSlug]: count }}` and the card's
stepper stays where the existing component draws it (inside the selected
card) — the mock puts the stepper in the footer instead. Render the
stepper in the footer and pass no `quantities` to the picker; the
card-level stepper stays unused here. Record: "stepper in the footer, per
the viewer mock; the card-level stepper is the model page's."

- [ ] **Step 3: Fixture, measure, gate, commit**

Fixture: idle with a selection, placing 1 of 2. Measure the modal width
720, card grid gap 10, thumb height 74, footer padding 14/20. Both themes.

```bash
git add frontend-v2/src/widgets/model-picker frontend-v2/src/entities/model frontend-v2/src/shared/ui/modal
git commit --no-verify -m "feat(frontend-v2): Add objects to territory — the picker modal, the quantity, and the placing line

Frontend-only; the backend gate is skipped — no Go code changed.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git show --numstat --format="" HEAD | awk '{print $3}'
```

---

### Task 13: `features/onboarding` — the tour engine, the A steps, the overlay

**Files:**
- Create: `src/features/onboarding/model/tour-state.ts` (+ `.spec.ts`) — port of `frontend/src/onboarding/domain/tour-state.ts` and its test (converted to vitest)
- Create: `src/features/onboarding/model/tour-step.ts` (+ one-line spec)
- Create: `src/features/onboarding/model/viewer-tour-steps.ts` (+ `.spec.ts`)
- Create: `src/features/onboarding/model/use-tour.ts` (+ `.spec.tsx`) — port of `frontend/src/onboarding/application/use-tour.ts` and its spec
- Create: `src/features/onboarding/api/tours-gateway.ts` (+ `.spec.ts`)
- Create: `src/features/onboarding/ui/tour-overlay.tsx` (+ `.spec.tsx`)
- Modify: `src/features/onboarding/ui/tour-tooltip.tsx` (+ spec), `src/features/onboarding/onboarding.fixture.tsx`, `src/features/onboarding/index.ts`

**Interfaces:**
- Produces: `VIEWER_TOUR = "viewer"`, `VIEWER_TOUR_STEPS: TourStep[]`, `useTour(id, steps, { seen, ready }) → Tour` (as the old), `markTourSeen(id)` (`POST /api/auth/me/onboarding/{id}`), `TourOverlay({ tour })`.
- `TourStep.tab?: OverlaysTab` (from `widgets/overlays-panel`? No — features cannot import widgets. Keep the literal union `"view" | "placements"` here; the panel's type is the same two strings.)

- [ ] **Step 1: Port `tour-state`, `tour-step`, `use-tour` with their specs**

`use-tour.ts` imports `markTourSeen` from `../api/tours-gateway`:

```ts
import { httpPost } from "@/shared/api";
/** One POST when a tour ends, finished or skipped; the server keeps the id. */
export const markTourSeen = (tour: string): Promise<void> =>
  httpPost<void>(`/api/auth/me/onboarding/${encodeURIComponent(tour)}`);
```

Its spec stubs `fetch` and asserts the URL and method.

- [ ] **Step 2: The A steps and their spec**

Keep from the old list, in order: `intro` (center), `catalog-link`
(`data-tour="catalog-link"` on `← Territories`), `reset-camera`,
`measure`, `overlays-tabs`, `add-object` (tab `placements`),
`objects-list` (tab `placements`), `shortcuts` (center). Drop
`panorama-picker`, `toggle-markers`, `panorama-marker`, `move-points`,
`external-link`, `add-panorama`, `add-document`, `user-menu` (B, or no
longer exists). Rewrite `overlays-tabs`'s body to A's truth: "Everything
you can add to the scene lives here. View holds the territory's facts;
Placements holds the models placed on it." and `shortcuts`'s body:
"M measure · T move · R rotate · S scale · G snap to surface · Esc step back
out. Reopen this tour any time with the ▶ button." Spec: eight steps, ids
unique, every `tab` is one of the two, the first and last are centred, no
body mentions a panorama or a document.

- [ ] **Step 3: The overlay — write the failing spec**

```tsx
it("dims the page, lifts the anchor, and places the tooltip beside it", () => {
  const anchor = document.createElement("button");
  anchor.dataset.tour = "reset-camera";
  document.body.append(anchor);
  anchor.getBoundingClientRect = () => ({ top: 20, left: 20, width: 30, height: 30, right: 50, bottom: 50, x: 20, y: 20, toJSON: () => ({}) });
  render(<TourOverlay tour={{ active: true, step: VIEWER_TOUR_STEPS[2], stepIndex: 2, total: 8, isLast: false, next: vi.fn(), prev: vi.fn(), skip: vi.fn(), restart: vi.fn() }} />);
  expect(screen.getByRole("dialog", { name: "Tour step 3 of 8" })).toBeInTheDocument();
  expect(screen.getByTestId("tour-dim")).toBeInTheDocument();
  expect(screen.getByTestId("tour-halo")).toHaveStyle({ top: "14px", left: "14px" });
  anchor.remove();
});
it("skips a step whose anchor is not on screen", () => { /* no element → next called in a layout effect */ });
it("Escape skips, the arrows move", () => { /* keydown on document */ });
```

`Tour` gains `stepIndex` and `total` so the tooltip can print `Step 3 / 8`
— add them to the ported `useTour`'s return (`state.index`,
`state.steps.length`) and to its spec.

- [ ] **Step 4: Implement the overlay and restyle the tooltip**

`tour-overlay.tsx` — port the old file's mechanics (`useAnchoredPosition`
does not exist in v2: measure with `getBoundingClientRect` in a layout
effect and on `resize`/`scroll` listeners — 20 lines, no new shared lib);
the dim is `fixed inset-0 z-[1200] bg-bg/60` (`data-testid="tour-dim"`,
`onClick={next}`); the halo `fixed z-[1201] rounded-[8px] border
border-accent shadow-[0_0_0_6px_var(--accent-soft)] pointer-events-none`
at `rect − 6` (`data-testid="tour-halo"`); the card is `TourTooltip` in a
`fixed z-[1210] w-[320px]` box placed beside the anchor (right of the
anchor when it fits, else below, else centred), no `motion`. `TourTooltip`
takes the mock's geometry: `rounded-card border border-line-2 bg-panel
p-4 shadow-elevation`, overline `font-mono text-[9px] uppercase
tracking-[0.2em] text-accent` reading `Step {n} / {total}`, title
`text-sm font-semibold`, body `text-xs leading-[1.6] text-muted`, buttons
`size="sm"`; keep `role="dialog" aria-label="Tour step n of total"`.

- [ ] **Step 5: Fixture, measure, gate, commit**

Fixture: the tooltip alone (step 3/8), and the overlay over a fake rail
with a `data-tour` anchor. Measure card width 320, padding 16, halo ring
6 px, dim opacity 0.6. Both themes.

```bash
git add frontend-v2/src/features/onboarding
git commit --no-verify -m "feat(frontend-v2): the guided tour — state, the eight viewer steps, the dim-and-halo overlay, the tooltip to the mock

Frontend-only; the backend gate is skipped — no Go code changed.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git show --numstat --format="" HEAD | awk '{print $3}'
```

---

### Task 14: `pages/territory-viewer` — the decisions, the container hook, the page, the screen, the fixtures

Load the three.js skills named in Global Constraints before starting (the
page threads the canvas's props and reads its report).

**Files:**
- Create: `src/pages/territory-viewer/model/viewer-view.ts` (+ `.spec.ts`)
- Create: `src/pages/territory-viewer/model/use-territory-viewer.ts` (+ `.spec.tsx`)
- Create: `src/pages/territory-viewer/model/use-placement-form.ts` (+ `.spec.tsx`)
- Create: `src/pages/territory-viewer/ui/viewer-header.tsx` (+ `.spec.tsx`)
- Create: `src/pages/territory-viewer/ui/viewer-overlays.tsx` (+ `.spec.tsx`)
- Create: `src/pages/territory-viewer/ui/viewer-error.tsx` (+ `.spec.tsx`)
- Create: `src/pages/territory-viewer/ui/territory-viewer-page.tsx` (+ `.spec.tsx`)
- Create: `src/pages/territory-viewer/ui/territory-viewer-screen.tsx` (+ `.spec.tsx`)
- Create: `src/pages/territory-viewer/territory-viewer-page.fixture.tsx`, `src/pages/territory-viewer/index.ts`

**Interfaces:**
- `viewer-view.ts` (pure, every decision the page draws):
  ```ts
  export type Grants = { create: boolean; write: boolean; delete: boolean; replace: boolean };
  export type HeaderPill = { tone: "ok" | "accent" | "neutral" | "bad"; label: string };
  export function headerPills(a: { ready: boolean; grants: Grants; mode: ViewerMode; tourActive: boolean; failed: boolean }): HeaderPill[];
  // ready → {ok,"ready"}; failed → {bad,"artifact unavailable"} instead of ready; no create/write/delete → {neutral,"viewer · read-only"}; write && !delete → {neutral,"editor · can move, cannot delete"}; mode==="measure" → {accent,"measuring"}; tourActive → {accent,"guided tour"}.
  export const headerMeta = (slug: string, lods: number, units: string) => `${slug} · ${lods} LODs · ${units}`;
  export const GUEST_SENTENCE = "You can look and measure.";
  export type RailTool = "reset" | "measure" | "add" | "tour";
  export function railTools(a: { grants: Grants; mode: ViewerMode; geometry: boolean }): { key: RailTool; state: "active" | "idle" | "inert" }[];
  // reset active in orbit with geometry; measure active in measure; add only with grants.create, active in place; all but tour inert without geometry; tour idle always (inert without geometry per mock state 6).
  export function modeChip(a: { mode: ViewerMode; measure: { segments: number; total: string } }): { text: string; kbd?: string };
  // orbit → "orbit · drag to rotate"; place → "place objects · click the ground"; measure → `measure · ${n} segments · ${total} total` (n===1 → "1 segment").
  export function stripItems(a: { metadata: SceneMetadata; shown: number | null; target: number | null; failed: boolean }): { items: string[]; tone: "neutral" | "bad"; accentLast: boolean };
  // ready: [formatDims, `${groupDigits(v)} vertices`, `${groupDigits(f)} faces`, shown===target ? `LOD ${shown} active` : `LOD ${shown} active · LOD ${target} loading`] with accentLast when loading; failed: ["no geometry loaded","dimensions unavailable","vertices —","faces —",`LOD ${target} requested`] tone bad.
  export const loadingChip = (p: { shown: number; target: number; text: string; percent: number }) => `coarse LOD ${p.shown} shown · LOD ${p.target} ${p.percent}% · ${p.text}`;
  export function errorCopy(e: ViewerError, at: Date): { title: string; body: string; footer: string; coarseLabel: string | null };
  // title "The territory mesh could not be loaded"; body `Storage returned ${status} for the LOD ${lod} mesh. The scene, placements and documents are intact — only the artifact download failed.` or "The download of the LOD n mesh failed. …" without a status; footer `${file} · last attempt ${HH:MM}`; coarseLabel `Load coarse LOD ${c} instead` or null.
  export const uploadedLine = (iso: string | null) => iso ? shortDate(iso) : "—";  // shared/lib/short-date
  ```
- `use-territory-viewer.ts` — the container:
  ```ts
  export type TerritoryViewerState =
    | { status: "loading" }
    | { status: "missing" }
    | { status: "unavailable"; error: string }
    | ({ status: "ready" } & TerritoryViewerPageProps);
  export function useTerritoryViewer(slug: string): TerritoryViewerState;
  ```
  Reads `sceneQuery(slug)` and `meQuery`; computes `grants` with `can`; `toSceneViewModel`; owns `targetLod` (default 0), `retryVersion`, `resetVersion`, `focusRequest`, the `LodReport`, the picker `open`, and composes `useViewerMode`, `useMeasurementTool`, `usePlacementsEditor`, `useTour`, `useOverlaysPanel`, `usePlacementForm`. Every callback handed to the canvas is `useCallback`ed. On `editor.onChanged` → `client.invalidateQueries({ queryKey: ["scene", slug] })`. Split: the hook itself under 200 lines by keeping the props assembly in `model/page-props.ts` (a pure function from the pieces to `TerritoryViewerPageProps`, spec'd).
- `use-placement-form.ts` — `{ form, openNew(id), openRename(id), close }` with the draft label/transform and `save()` calling `editor.update`/`editor.rename`; `cancel` on a `new` form calls `editor.remove(id)`.
- `TerritoryViewerPageProps` — everything the page draws, no hooks inside the page: `header`, `canvas` (the `ViewerCanvasProps`), `overlays` (rail tools + handlers, chips, switcher, strip, hints, error), `panel` (the `OverlaysPanel` props + `PlacementsPanelProps` + the View tab's `DetailList` items), `picker` (`PlaceObjectsModal` props), `tour` (`Tour`), `loadingScene: boolean`.

- [ ] **Step 1: `viewer-view.spec.ts` — a table per function**

Write every branch listed in the Interfaces comments as a case; include:
`headerPills` for the owner (no grant pill), for write-only, for a guest,
for measuring + guest (two pills, `ready` first), for failed + tour;
`railTools` for a guest (no `add`), for state 6 (everything inert but
tour… the mock draws tour inert too — follow the mock: `tour` inert without
geometry), for place mode (`add` active); `modeChip` singular/plural;
`stripItems` ready, loading, failed; `errorCopy` with and without a status
and with/without a coarser level; `uploadedLine` null.

- [ ] **Step 2: Implement `viewer-view.ts` to make it pass**

Straight-line code from the comments; keep every string a named constant
at the top of the file so the fixtures and the live pass read the same
text. Under 200 lines — if not, `strip-and-chips.ts` takes `stripItems`,
`modeChip`, `loadingChip`.

- [ ] **Step 3: `use-territory-viewer.spec.tsx`**

Harness like `use-territory-conversion.spec.tsx`: a fresh `QueryClient`
per render, `vi.mock` of `@/entities/scene` (`getSceneBundle`),
`@/entities/user` (`getMe`), `@/entities/placement` (the three gateway
calls) and `@/features/onboarding` (`markTourSeen`). Cases:
- loading until both queries answer; `missing` on a 404 `HttpError`; `unavailable` on another error; a later refetch error keeps the page (`unanswered`).
- grants from the principal: an owner gets all four; `["placement:write"]` gets write only; `replace` needs `territory:write`.
- the canvas props carry `targetLod 0`, the mode, the selection; `onLod` report flows into `overlays.strip` and `overlays.switcher.shown`.
- `select(4)` from the canvas → the panel's `selectedId`, the selected block's name `storage-tank-500 #1`, the panel tab flips to `placements`.
- `onPlace("tank", 2)` → `editor.create` called, then the form opens `new` on the last id and the picker closes.
- `overlays.error.onCoarse()` sets `targetLod` to the coarser level; `onRetry` bumps `retryVersion`.
- a mutation success invalidates `["scene", slug]` (spy `invalidateQueries`).
- `onFocus(id)` sets `focusRequest` to a new array `[id]`.

- [ ] **Step 4: Implement the hook + `page-props.ts` + `use-placement-form.ts`**

```ts
export function useTerritoryViewer(slug: string): TerritoryViewerState {
  const client = useQueryClient();
  const me = useQuery(meQuery);
  const scene = useQuery({ ...sceneQuery(slug), queryFn: () => getSceneBundle(slug) });
  const bundle = scene.data;
  const vm = bundle ? toSceneViewModel(bundle) : null;
  const grants = useMemo(() => ({
    create: can(me.data ?? null, "placement:create"),
    write: can(me.data ?? null, "placement:write"),
    delete: can(me.data ?? null, "placement:delete"),
    replace: can(me.data ?? null, "territory:write"),
  }), [me.data]);

  const [targetLod, setTargetLod] = useState(0);
  const [retryVersion, setRetryVersion] = useState(0);
  const [resetVersion, setResetVersion] = useState(0);
  const [focusRequest, setFocusRequest] = useState<number[] | null>(null);
  const [lod, setLod] = useState<LodReport>({ shown: null, target: null, percent: null, progressText: null, failure: null });
  const [pickerOpen, setPickerOpen] = useState(false);
  const onLod = useCallback((r: LodReport) => setLod(r), []);

  const measure = useMeasurementTool();
  const mode = useViewerMode({ canWrite: grants.write, chainOpen: measure.activeChainId !== null, onCancelChain: measure.cancelChain });
  const dims = vm?.metadata.dims ?? { x: 0, y: 0, z: 0 };
  const territoryMaxDim = Math.max(dims.x, dims.y, dims.z);
  const onChanged = useCallback(() => { void client.invalidateQueries({ queryKey: ["scene", slug] }); }, [client, slug]);
  const editor = usePlacementsEditor({ slug, initial: vm?.placements ?? [], options: bundle?.modelOptions ?? [], territoryMaxDim, onChanged });
  const form = usePlacementForm(editor, mode.select);
  const seen = me.data?.onboardingToursSeen.includes(VIEWER_TOUR) ?? true;
  const tour = useTour(VIEWER_TOUR, VIEWER_TOUR_STEPS, { seen, ready: vm !== null });
  const panel = useOverlaysPanel(mode.state.selectedId, tour.step?.tab, tour.active);
  // … the remaining wiring, then:
  if (me.isPending || scene.isPending) return { status: "loading" };
  const err = unanswered(scene);
  if (err instanceof HttpError && err.status === 404) return { status: "missing" };
  if (err) return { status: "unavailable", error: messageOf(err) };
  return { status: "ready", ...pageProps({ /* every piece above */ }) };
}
```

(`usePlacementsEditor` takes `initial` once; when the bundle refetches
after a mutation, the editor's list is already optimistic. A refetch that
brings *other* changes — another user's edits — is out of scope; note it
in the report.) The old `ModelViewer` composed exactly this; keep its
comments where they still apply.

- [ ] **Step 5: The page components — write the failing specs, then implement**

`viewer-header.tsx`: `← Territories` (`<a href="/territories">` with
`data-tour="catalog-link"`), the divider, `<h1 className="m-0 truncate
text-[19px] font-semibold tracking-[-0.02em]">`, one `Badge` per pill
(`size="sm" fill="soft"` for ok/accent/bad; `fill="outline"` neutral),
the meta line (`hidden max-[1280px]:hidden` → simply `max-[1280px]:hidden`),
the guest sentence, `Replace source` as `<a href={…/replace}>` styled like
`ConversionActions`'s `SECONDARY` (reuse: move `CONTROL/PRIMARY/SECONDARY`
from `conversion-actions.tsx` into `shared/ui/button/link-class.ts`
exporting `linkButtonClass(variant)`, with a spec, and import it from both
— one style, two callers). Spec: the h1 text, the pills in order, the
replace link only with `grants.replace`, the sentence only for a guest,
`data-tour` present.

`viewer-overlays.tsx`: absolutely positioned children over the viewport —
the rail column (`absolute left-3.5 top-3.5 flex flex-col items-start
gap-2`: `ToolRail label="Viewer tools"` with the `↺ ↔ ＋ ▶` glyphs and
names `Reset camera`, `Measure (M)`, `Add objects`, `Replay guided tour`
and `data-tour` ids `reset-camera`, `measure`, `add-object`; then the
`ModeChip`, or the two loading chips, then in measure mode the `Clear`
/ `Close measurement chain` row (`size="sm"` buttons)); the
`LodSwitcher` at `absolute top-3.5 right-[calc(var(--overlays-w)+28px)]`;
the `StatsStrip` at `absolute left-3.5 bottom-3.5` (`bottom-[60px]` in
measure mode); the keycap pair at `absolute right-[74px] bottom-3.5` when
the panel is collapsed and mode is orbit; the measure hint bar
`absolute left-3.5 right-[calc(var(--overlays-w)+28px)] bottom-3.5 flex
items-center justify-center gap-[9px] rounded-[10px] border
border-accent-line bg-panel px-3.5 py-[9px] font-mono text-[10px] text-fg
shadow-elevation` with `Click two points · Shift+click removes the chain
· Esc exits`; the 2 px progress line `absolute inset-x-0 top-0 h-0.5
bg-line` with an accent fill at `percent` (`role="progressbar"
aria-label="Loading LOD {n}"`); and `ViewerError` centred when
`error !== null`. Spec by roles and names for each mode; the strip's
content; the switcher's offset is measured, not asserted.

`viewer-error.tsx`: `ErrorState` is a compact card; the mock's is a 520
px centred card with an icon tile and two buttons. Add `size="lg"` to
`ErrorState` (icon tile 46 px `rounded-card border border-bad bg-bad-soft`,
title `text-lg font-semibold tracking-[-0.015em]`, body `max-w-[44ch]
text-[13px] leading-[1.6] text-muted`, actions row, footer slot mono 10
dim) with a spec case and fixture entry; `ViewerError` fills it from
`errorCopy` and wires `Try again` (`variant="primary"`) and the coarse
button. `role="alert"` comes from `ErrorState`.

`territory-viewer-page.tsx`: the header, then `<div className="relative
flex-1 min-h-0 bg-panel">` holding `<Suspense fallback={<ViewerSkeleton
/>}>` → `<ViewerCanvas {...canvas} />`, `<ViewerOverlays …/>`,
`<OverlaysPanel …/>` (with the View tab's `DetailList` and the
`PlacementsPanel`), `<PlaceObjectsModal …/>`, `<TourOverlay tour …/>`.
`widgets/viewer-skeleton` exists — restyle it to the mock's state 16 card
(380 wide, `Loading interface…` overline, an indeterminate `ProgressBar`,
two `Skeleton` lines) and centre it in the viewport. Spec: renders every
region by role (`banner`? no — the header is a `<header>` inside `main`,
so `role="banner"` does not apply; query by the h1), `toolbar`,
`complementary`, `dialog` when the picker is open.

`territory-viewer-screen.tsx`: the route component — `useParams`, the
hook, `loading` → the page's loading layout (header skeletons + the
centred skeleton card, mock state 16), `missing` → `EmptyState "Territory
not found"` with the `← Territory catalog` link, `unavailable` → `Callout
tone="bad"`, `ready` → the page. Keyed on `slug` like the conversion screen.

- [ ] **Step 6: Fixtures — one per mock state**

`territory-viewer-page.fixture.tsx` wraps each in `<CatalogShell
layout="viewport">` and stubs the canvas: pass `canvas` props with
`parentLods: []` so nothing fetches, and render the page's `ViewerCanvas`
through a fixture-only `canvasSlot` prop? No — a page prop that exists for
fixtures is a smell. Instead the fixture mocks nothing and relies on an
empty chain: the canvas mounts the grid and lights only. States: `1
collapsed`, `2 selected translate`, `3 loading (report shown 2 target 0
percent 62)`, `4 measuring (two chains from a fixture helper)`, `5 guest`,
`6 error`, `7 empty`, `13 write-no-delete`, `14 create form + saving`,
`15 tour step 3`, `16 loading`, `17 compact 1280` (the fixture sets a
`max-w-[1280px]` wrapper). Each state's props come from a
`fixtures/states.ts` helper beside the fixture (`*.fixture.tsx` files are
exempt from the spec rule; a helper `.ts` is not — name it
`territory-viewer-states.fixture.tsx` so the glob exempts it, and export
the objects from there).

- [ ] **Step 7: Measure every state in Cosmos at 1440 and 1280, both themes**

Top bar `padding 14px 20px` (18 at 1280), gap 16 (14), h1 `19px/600`,
pill `padding 3px 11px, fontSize 9px`; the switcher's `right` = 70 / 348 /
326 in the three panel states; strip `bottom 14px` (60 in measure); hint
bar spans to the panel edge; error card `width 520px, padding 34px 32px`;
loading card `width 380px`; panel 320 / 300. Screenshots named by state
beside the mock's. Report the numbers.

- [ ] **Step 8: Gate + commit**

Run: `yarn lint && yarn test:coverage && yarn build`

```bash
git add frontend-v2/src/pages/territory-viewer frontend-v2/src/widgets/viewer-skeleton frontend-v2/src/shared/ui frontend-v2/src/pages/territory-conversion
git commit --no-verify -m "feat(frontend-v2): the territory viewer page — the decisions, the container, the header and overlays, the error card, and a fixture per mock state

Frontend-only; the backend gate is skipped — no Go code changed.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git show --numstat --format="" HEAD | awk '{print $3}'
```

---

### Task 15: The route branch, the end of the old-SPA handoff, the preload, the live pass

**Files:**
- Create: `src/app/router/territory-route.tsx` (added to `exempt-modules.ts` with the wiring comment)
- Modify: `src/app/router/catalog-routes.tsx` — loader + component
- Modify: `src/pages/territory-conversion/model/use-territory-conversion.ts` (+ spec), `model/conversion-view.ts` (+ spec), `ui/conversion-actions.tsx` (+ spec)
- Delete: `src/shared/lib/leave.ts` (+ spec)
- Modify: `src/app/router/guard.ts` (comment), `guard.spec.ts` (comment)
- Modify: `src/pages/territory-catalog/ui/territory-catalog-page.tsx` (+ spec) — preload
- Create: `.superpowers/sdd/2026-09-10-territory-viewer-v2/live.py`

- [ ] **Step 1: The route**

`territory-route.tsx`:

```tsx
import { useQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { sceneQuery, sceneReady } from "@/entities/scene";
import { TerritoryConversionScreen } from "@/pages/territory-conversion";
import { TerritoryViewerScreen } from "@/pages/territory-viewer";

/**
 * One URL, one fetch, one branch: a territory with a LOD0 is the viewer,
 * anything else is the conversion page. The loader primed the cache, so the
 * bundle is here on the first render; a conversion that finishes on the page
 * invalidates the same key and this component re-branches into the viewer
 * without a document load.
 */
export function TerritoryRoute() {
  const { slug } = useParams({ strict: false }) as { slug: string };
  const { data } = useQuery(sceneQuery(slug));
  if (data && sceneReady(data)) return <TerritoryViewerScreen />;
  return <TerritoryConversionScreen />;
}
```

`catalog-routes.tsx`'s `territoryRoute` gains
`loader: ({ context, params }) => context.queryClient.ensureQueryData(sceneQuery(params.slug)).catch((e) => { if (e instanceof HttpError && e.status === 404) throw notFound(); throw e; })`
and `component: TerritoryRoute`. The conversion screen's own queries stay
as they are (it reads artifacts/jobs, not the bundle); `sceneQuery`'s 404
answers the route's `notFound` for both branches.

`CatalogShellRoute` renders `<CatalogShell>` with the page layout; the
viewer needs `viewport`. The shell route does not know which leaf is
active. Make `CatalogShellRoute` read the matched route:
`const viewer = useMatch({ from: territoryRoute.id, shouldThrow: false })`
is circular (`catalog-routes` imports the shell route). Instead the viewer
screen sets the layout itself: `CatalogShell` reads a `data-layout`… no.
Simplest: `catalog-shell-route.tsx` uses `useRouterState({ select: (s) =>
s.location.pathname })` and `isTerritoryPage(pathname)` from `guard.ts`
(the existing `TERRITORY_PAGE` regex, exported as a predicate with a spec
case) → `layout="viewport"` for that path. The conversion page then also
renders under `viewport`; give the conversion page its own
`mx-auto w-full max-w-[760px] px-9 pt-8 pb-[72px] overflow-auto` wrapper
so it keeps its geometry (measure its h1 offset stays 97 px — the
conversion package's number).

- [ ] **Step 2: End the handoff**

`use-territory-conversion.ts`: delete the `leaveTo` import, the
`previousPhase` effect and `onOpenViewer`; when `finishedSince` reports
this territory, also `client.invalidateQueries({ queryKey: ["scene", slug] })`
(the route re-branches). `conversion-view.ts`: delete `shouldLeave`;
`TerritoryConversionPageProps` loses `onOpenViewer`; `ledeOf("ready")` →
"The artifacts are in place. The viewer opens on this page." Update the
specs (drop the `shouldLeave` describe; the ready lede). `conversion-actions.tsx`:
the `ready` branch's `Open the viewer` becomes `<a href={territoryPath(slug)}>`
(a plain in-app link — the same URL, now the viewer; the click delegate
navigates, the route re-reads the cache and branches); the failed branch's
`Open the current viewer` likewise. Delete `shared/lib/leave.ts` and its
spec; `grep -rn leaveTo src` must answer nothing.

`guard.ts:801-807` comment: "…a territory's own page — the conversion
screen while it converts, the viewer once it is ready." `guard.spec.ts:614`
comment likewise. `CLAUDE.md` (frontend-v2) Routes paragraph — Task 16.

- [ ] **Step 3: Preload from the catalog card**

`territory-catalog-page.tsx`: on a ready card's `onMouseEnter`/`onFocus`
call `preloadViewer()` (import from `@/widgets/viewer-canvas`). The
`TerritoryCard` takes `onPreload?: () => void` and puts the two handlers on
its root (add to `entities/territory/ui/territory-card.tsx` + spec case).
Spec on the page: hovering a ready card calls the preload once (mock the
widget barrel); a converting card does not.

- [ ] **Step 4: Gate**

Run: `yarn lint && yarn test:coverage && yarn build`
Expected: all green; `grep -rn "leaveTo\|shouldLeave" src` empty.

- [ ] **Step 5: The live pass — write `live.py` and run it**

Pattern: `.superpowers/sdd/2026-09-08-territory-conversion-v2/live.py`.
Stack up: gateway :8080, `yarn dev` on :3001. Script sections, each
printing one line per check and screenshotting both themes:

1. `admin` → `/territories/dji-wp46-cut`: wait for `role=status` named
   `Scene stats`; assert the `Loading model` chip appears, then disappears;
   the strip ends with `LOD 0 active`; `canvas` present; read a centre
   pixel ≠ the panel colour (geometry drawn). Click `LOD 2` in the
   radiogroup → strip `LOD 2 active`. Press `m`, click two canvas points
   (centre and centre+120px) → chip `measure · 1 segment · … m`; `Escape`
   twice → chip `orbit · drag to rotate`.
2. `Add objects` → dialog `Add objects to …`; pick `live-cube`; `+` once;
   `Place 2 × live-cube` → `Placing 1 of 2…` seen; dialog closes; panel
   shows `live-cube · 2 instances · #2 selected`; the form `Selected · new`;
   type a label, `Save` → the instance row reads `#2 · {label}`. Drag the
   gizmo: `page.mouse` down on the selected instance's screen position
   (read from the strip? no — take the canvas centre after a `Focus`), move
   80 px, up → exactly one `PUT /placements/{id}` in the request log.
   `Rename live-cube #1` → change → one PUT. `Delete live-cube #1` → one
   DELETE; the group reads `1 instance`. Delete the other to leave the
   territory as found.
3. `Replay guided tour` → dialog `Tour step 1 of 8`; `ArrowRight` ×7 →
   `Done`; one `POST /api/auth/me/onboarding/viewer`.
4. `guest1` → same territory: no `Add objects` tool, the `viewer ·
   read-only` pill, `Focus live-cube #1` (create one as admin first, or
   assert on `dji-wp46-cut`'s existing placements) refits the camera (the
   centre pixel changes).
5. `editor1` → print which of the three grants `/api/auth/me` lists, and
   assert the pill and the rows match the table in the spec.
6. `cotest` → `/territories/tenant-a-scene`: the conversion page renders
   (`role=alert` worker message), the h1 at 34 px / offset 97.
7. Upload the 458-byte OBJ cube as `admin` (`live-upload.py` from the
   conversion package) → the conversion page → SSE → the page re-branches
   into the viewer with **0 document loads** (count `page.on("load")`).
8. Every navigation above: 0 document loads except the initial one per
   login.

Put the transcript in the report verbatim; screenshots `live-{state}-{theme}.png`.

- [ ] **Step 6: Commit**

```bash
git add frontend-v2/src frontend-v2/exempt-modules.ts .superpowers/sdd/2026-09-10-territory-viewer-v2/live.py
git commit --no-verify -m "feat(frontend-v2): /territories/{slug} branches into the viewer on a LOD0 — the old-SPA handoff ends, the catalog card warms the chunk

Frontend-only; the backend gate is skipped — no Go code changed.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git show --numstat --format="" HEAD | awk '{print $3}'
```

(The SDD directory is git-ignored; `live.py` stays local like the earlier
ones. Drop it from the `git add` if git refuses it.)

---

### Task 16: Docs

**Files:**
- Modify: `frontend-v2/CLAUDE.md` — the Routes paragraph, the closing line, a "Viewer" section (the Canvas boundary, the three exempt files and why, the blob-URL download, the shown-vs-warm failure rule, the `--overlays-w` variable, `layout="viewport"`), the deviations list from the spec §6.
- Modify: `CLAUDE.md` (root) — the "Two frontends" paragraph: the viewer is v2 for a ready territory; only nothing remains in `frontend/` except panoramas and documents until package B.

- [ ] **Step 1: Write the paragraphs; every sentence checkable against a file**
- [ ] **Step 2: Reviewer (sonnet) checks each claim against the named file**
- [ ] **Step 3: Commit**

```bash
git add frontend-v2/CLAUDE.md CLAUDE.md
git commit --no-verify -m "docs: the territory viewer in v2 — the Canvas boundary, the LOD rules, the exempt setup files, and the recorded deviations

Frontend-only; the backend gate is skipped — no Go code changed.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git show --numstat --format="" HEAD | awk '{print $3}'
```

---

## Self-review against the spec

**Coverage.** §1 route and shell → Tasks 1, 15. §2 `entities/scene` →
Task 2; `features/lod` (target, download, retry, coarse) → Task 7 + Task 9's
`GltfModel`; `features/viewer-mode` (reducer, layered Esc, keys) → Task 5;
`features/placements-editor` (`groupByModel`, `instanceName`,
`realWorldScale`, N POSTs with `Placing k of N`, grants as booleans) →
Task 8; `entities/measurement` + `features/measure` → Task 6;
`features/onboarding` (A subset, `POST onboarding/viewer`, `TourTooltip`
geometry) → Task 13; `useOverlaysPanel` + `localStorage` → Task 10. §3 the
widget's props/callbacks, token colours, `focusRequest`, lazy + preload →
Tasks 9, 15. §4 the seven primitives → Tasks 3, 4; the panel → Task 10; the
View tab `DetailList` → Task 14; the Placements tab, the selected block,
the create form, the empty state, the footers → Task 11; the picker → Task
12; the pills/rail table, the service states, 1280 → Task 14. §5 testing
→ each task; the live pass → Task 15. §6 deviations → Task 16 records them.

**Placeholders.** Task 8 Step 6 and Task 14 Steps 3 and 5 describe spec
cases in prose where the implementer writes the code — each names the
observable and the assertion; none says "add tests". Task 9 Step 4 lists
per-file cases in prose for the same reason. No TBD/TODO remains.

**Type consistency.** `LodArtifact`, `ResolvedPlacement` (`chain`, not
`lods`), `ModelOption.chain`, `SceneMetadata.dims`, `GizmoMode` from
`features/viewer-mode` (not `entities/placement`), `ViewerMode`,
`LodReport`, `LodFailure`, `ViewerError`, `PlacementGroup`/`PlacementInstance`,
`Grants`, `OverlaysTab` are each defined once and used by those names in
every later task. `onShownDropped` is added to Task 7's hook by Task 9
(the plan says where). `Tour.stepIndex/total` are added by Task 13.

**Known rulings carried into execution.** (1) `useProgressiveLod`'s
shown-failure holds until retry (the error card) while a warm failure drops
silently (the old ladder) — argued in spec §2. (2) The conversion page
renders under `layout="viewport"` with its own padded wrapper — the cost
is one wrapper div; the alternative was a route-aware shell that imports
the route tree it sits in. (3) `EmptyState layout="panel"`, `ErrorState
size="lg"`, `Modal size="lg"`, `Tabs variant="segments"`, `Vec3Field
layout="row"`, `ModelPicker columns` — six small DS extensions rather than
six page-local copies; each carries a spec case and a fixture entry.
