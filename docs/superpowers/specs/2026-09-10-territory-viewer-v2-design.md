# Territory Viewer v2, package A — the 3D viewer at `/territories/{slug}`

Date: 2026-09-10. Branch: `feat/frontend-v2-design-system` (PR #38, dev ←
branch). Mock: Claude Design project `b5fa4afe-…`, file
`Territory Viewer v2.dc.html`, seventeen states (every measurement, token and
string in `.superpowers/sdd/2026-09-10-territory-viewer-v2/mock-digest.md`;
the code recon this spec leans on is `recon.md` beside it; the ledger
directory is git-ignored, both are working copies).

## Goal

The 3D viewer leaves the old SPA. For a territory whose LOD0 exists,
`/territories/{slug}` renders the mock's page in `frontend-v2`: the top bar,
the full-height scene with progressive LOD, the tool rail, the LOD switcher,
the stats strip, the Overlays panel with placements, the measure tool, the
guided tour, and the guest, error, empty and loading states. The old app's
proven three.js layer and its tested pure domains move over; every panel,
chip and button is built anew on `shared/ui` to the mock. Nothing in
`frontend/` changes.

**Package A is states 1–7 and 13–17 of the mock.** Panoramas and documents
(states 8–12, `entities/panorama`, `entities/document`, both uploads, the
PDF window, calibration, per-panorama visibility) are package B, with their
own spec. Until B ships, the old SPA stays deployed; v2 is not in production.

## Decisions (user)

- **Two packages by dependency.** A is self-contained (scene, LOD,
  placements, measure, tour, the service states); B lays panoramas and
  documents on top. One spec, one plan, one final review each.
- **Groups expand into instances.** The placements list is grouped by model
  as drawn (`storage-tank-500 · 3 instances · #2 selected`), and a group row
  opens into its instances (`#1 · Tank 4, north row`, `#2`, `#3`), each
  selectable, renamable and deletable on its own. Rename/Delete leave the
  group row; the mock's group-level actions are a recorded deviation, because
  a group has no single label to rename.
- **The three layer is tested three ways.** Pure decisions out into plain
  functions with table specs; `@react-three/test-renderer` for every three
  component it can mount; the coverage exemption list only for the setup
  files that need WebGL or workers; a Playwright live pass before the final
  review. The 90/85/90/90 thresholds do not move.
- **Nothing of B is drawn in A.** No `◎ Panoramas` / `▤ Documents` in the
  rail, no Panoramas / Documents sections on the View tab. "A control nothing
  wires is not drawn" — greyed ghosts are worse than absence.
- **Latest versions.** `three` 0.186.0 (pinned exact, as the old app pins
  it), `@react-three/fiber` 9.7.0, `@react-three/drei` 10.7.8, `three-stdlib`
  2.36.1 (explicit — the old app used it as a phantom dependency through
  drei), `three-mesh-bvh` 0.9.15, `@types/three` 0.185.4 (no 0.186 types
  yet), dev `@react-three/test-renderer` 9.1.1. `public/draco/` and
  `public/basis/` are copied from the installed
  `node_modules/three/examples/jsm/libs/`, never from `frontend/public/` —
  the Basis transcoder must match the installed three or KTX2 models render
  white with no error. If `@types/three` 0.185.4 breaks `tsc -b` under
  0.186, three drops to 0.185.1 and this spec records it.
- **The FSD port, not a blob and not a rewrite.** Tested pure domains move
  verbatim with their specs; three files move as they are into one widget;
  orchestration hooks move into features with the gateway re-pointed;
  presentation is written to the mock on `shared/ui`.
- **Skills.** Every implementer and reviewer touching `widgets/viewer-canvas`
  or `features/lod` loads, by name, `threejs-fundamentals`,
  `threejs-interaction`, `threejs-loaders`, and by task `threejs-geometry`
  (BVH, clones, raycast), `threejs-materials` and `threejs-textures` (KTX2,
  sRGB), `threejs-lighting`. `threejs-animation`, `threejs-postprocessing`
  and `threejs-shaders` are not needed by A. The standard front-end list
  applies to everyone.

## 1. Route and shell

`/territories/$slug` stays one route under `catalogRoute`. Its loader
`ensureQueryData(sceneQuery(slug))` (404 → `notFound()`); `validateSearch`
keeps `{ jobId? }` for the conversion branch. The route component reads the
bundle and branches on the pure `sceneReady(bundle)` (`entities/scene`): LOD0
present in `artifact.artifacts` → `TerritoryViewerScreen`, otherwise the
existing `TerritoryConversionScreen`. One route, one fetch, one branch — the
old app's `toSceneViewModel === null → ConversionPending` shape.

The old-SPA handoff ends. `shouldLeave`, the `leaveTo` effect and
`onOpenViewer` in `use-territory-conversion.ts`, `shared/lib/leave.ts` and
their spec cases are deleted. When a conversion the page watches reaches
`succeeded`, the page invalidates `sceneQuery(slug)`; the route re-renders
into the viewer without a document load. `ledeOf("ready")` is reworded (the
viewer is this app now); `guard.ts`'s `isCatalogHref` comment and the Routes
paragraph of `frontend-v2/CLAUDE.md` stop asserting the handoff.

`CatalogShell` gains one prop, `layout: "page" | "viewport"` (default
`page`). Under `viewport` the `<main>` is `flex h-dvh min-w-0 flex-col` with
no padding; the click delegate, `meQuery` and `Toaster` are inherited. The
mock's top bar is page content: `← Territories` (link to `/territories`,
mono 10, tracking 0.2em, uppercase, muted), a 1×22 divider, `<h1>` 19/600
(the mock's `h2`; the page has no other heading, so it is the h1, styled to
the mock's size) with ellipsis, the status pills, the meta line
`{slug} · {n} LODs · {units}` (absent under 1280), and `Replace source`
(secondary `Button`, refresh icon, → `/territories/{slug}/replace`) shown
only with `territory:write`. No `Share` — there is no endpoint.

Preload: hovering or focusing a ready territory card in the catalog calls
`preloadViewer()` (the widget's `lazy()` import), as `ViewerEntry` did.

## 2. Data and state

### `entities/scene` (new)
- `api/scene-gateway.ts`: `getSceneBundle(slug)` → `SceneBundle`
  `{ territory, artifact: Artifact | null, placements, modelOptions }` with
  DTO→domain mapping (rotation in radians as served; `artifacts[]` chain with
  per-LOD `size/vertices/faces`). Panoramas and documents are not mapped in A.
- `api/scene-query.ts`: `sceneQuery(slug)`, key `["scene", slug]`,
  `staleTime` 30 s.
- `model/lod.ts`: the old `lod-artifact.ts` verbatim — `LodArtifact`,
  `orderByPreferred`, `pickLod`, `pickCoarsest`, `selectProgressive` — with a
  spec of its own (the old app covered it only through a hook).
- `model/scene-view-model.ts`: `sceneReady(bundle)`, `toSceneViewModel(bundle)`
  → `{ parentLods, metadata: { dims, units, vertices, faces, uploadedAt },
  placements: Placement & { chain: LodArtifact[] } }`, joining each placement
  to its model's chain by slug. Spec ported.
- `model/format.ts`: `formatDims` (`36.0 × 24.0 × 8.5 m`), `groupDigits`
  (space thousands) — move from `widgets/viewer-panel`, which is deleted;
  `pages/model-detail` re-imports from here.

### `features/lod`
`useProgressiveLod(chain, target)`: the old hook (coarsest shown at once,
target warmed off-screen, swap on ready, a failed hash dropped from the
chain) plus a `target` from the switcher. **Default target LOD 0**, the old
behaviour and what the measure raycast needs; the mock's `LOD 1 active` in
states 1/5/7/12/13 is a recorded deviation. The target's download runs
through `fetch` with a streamed body into a blob URL — the mock's `LOD 0
62% · 6.1 / 9.8 MB` and the 2 px progress line need real numbers, and drei's
loader exposes none; the denominator is `artifacts[].size`, the blob URL
goes to `useGLTF` (drei caches by URL, so one download per level). Pure:
`lodProgress(received, total)` → `{ percent, mb }`. Error card actions:
**Try again** resets the error boundary for the failed hash; **Load coarse
LOD 2 instead** sets `target` to `pickCoarsest(chain)`; both are one line
over existing state.

### `features/viewer-mode`
`viewerModeReducer(state, action)` — pure, table-tested. State
`{ mode: "orbit" | "place" | "measure", selectedId: string | null, gizmo:
"translate" | "rotate" | "scale", snap: boolean }`. Actions: `toggleMeasure`
(M — drops the selection), `setGizmo` (T/R/S — only with a selection),
`toggleSnap` (G), `select(id)`, `deselect`, `enterPlace`, `exitPlace`,
`escape`. **`escape` is layered**: an open measurement chain breaks first (the
measure hook answers whether one is open), then a selection clears, then
measure/place mode exits. Keys are read by the ported `useKeyboardShortcuts`
(case-insensitive, ignored inside INPUT/SELECT/TEXTAREA).

### `features/placements-editor`
`usePlacementsEditor(slug, placements, modelOptions, can)` — the old hook
on `entities/placement/api` (`createPlacement`, `updatePlacement`,
`deletePlacement`; optimistic with `MutationState`, `pendingIds`). New pure
pieces: `groupByModel(placements, modelOptions)` → `{ model: { slug, title },
instances: [{ id, index, label }] }[]` sorted by title, instances by
`createdAt`; `instanceName(model, index)` → `storage-tank-500 #2`;
`realWorldScale(modelBbox, territoryBbox)` from the old `realWorldRatio`
(`DEFAULT_SCALE = 0.1` fallback). Placing `N × model` is N sequential
`POST`s (no batch endpoint); the modal's footer reads `Placing k of N…` and
the last created instance becomes the selection with the create form open
(state 14). `canCreate / canWrite / canDelete` are computed once in the page
hook from `can(me, "placement:create" | "placement:write" |
"placement:delete")` and handed down as booleans.

### `entities/measurement` + `features/measure`
`chain.ts` (`CLOSE_TOLERANCE`, `shouldCloseAt`, `appendPoint`, `closeChain`,
`removeSegment`), `distance.ts` (km/m/cm/mm, `u` when the ratio is 1),
`unit-ratio.ts` (maxDim/2), `measurement-reducer.ts` and
`use-measurement-tool.ts` move verbatim with their specs. The existing
`MeasureButton` is replaced by the rail tile; the feature keeps the hook.
`Clear`, `Close measurement chain` and the segment/chain removal
(`×`, Shift+`×`) keep the old semantics; the chip reads
`measure · {n} segments · {total}` and the header pill `measuring`.

### `features/onboarding`
`useTour`, `tour-state.ts` and the viewer steps move with their specs;
steps whose anchors arrive in B are dropped and the counter counts what is
left (`Step 3 / N`). Finishing or skipping posts
`POST /api/auth/me/onboarding/viewer`; `Principal.onboardingToursSeen`
decides the first-run start; `▶` replays. The existing `TourTooltip` gets
the mock's geometry (320 wide, overline accent, Back/Next, Skip tour) and the
dim is `--bg` at 60 % with the anchor lifted above it by an accent ring.

### `widgets/overlays-panel` state
`useOverlaysPanel` (tab, collapsed, tab forced by the tour or a selection)
moves; `collapsed` persists in `localStorage` `andrey.overlays` inside
try/catch, like the theme.

## 3. The scene layer — `widgets/viewer-canvas`

One widget with a `three/` folder. Moving as they are, imports re-pointed:
`scene-canvas`, `camera-rig` (three-stdlib `OrbitControls`, `set({controls})`,
reset on `resetVersion`), `gltf-loader-setup` (Draco → KTX2 → BVH order and
its comments verbatim), `ktx2-init`, `glb-preloader` (coarsest level only —
do not add LOD0 back), `gltf-model`, `lod-warmer`, `lod-error-boundary`,
`lighting`, `is-descendant`, `placements-layer`, `placement-instance`,
`use-gizmo-events`, `scale-gizmo-patch`, `snap-to-surface`, `snap-translate`,
`measurement-layer`, `measurement-segment`, `point-marker`. The panorama layer
and `camera-position-tracker` wait for B; `visiblePlacements` is every
placement.

Props in, callbacks out, no context across the reconciler:
`parentLods, targetLod, placements, mode, selectedId, gizmo, snap, canWrite,
measurement, resetVersion, focusRequest` and `onPick(id | null)`,
`onTransformCommit(id, transform)`, `onMeasurePoint(point)`,
`onLodShown(lod)`, `onLodFailed(hash)`, `onLodProgress`.

Colours come from tokens: background `--panel`, grid `--grid`, read with
`getComputedStyle` on mount and on theme change (`useTheme`); the old hex
literals go. In-scene `Html` labels (gizmo chip `{model} · #n` at mono 9,
distance chips at mono 11) are Tailwind classes on tokens to the mock's
geometry.

Unchanged behaviour: `Bounds fit clip observe` around the territory only,
`frameloop="demand"`, `SkeletonUtils.clone` per instance, BVH on the
territory, the gizmo written through `useLayoutEffect`, commit on
`dragging-changed → false`, OrbitControls suspended during a drag. New:
`focusRequest: string[]` (instance ids) refits `Bounds` to those objects —
the guest's `Focus` and a single click on an instance row.

`ViewerCanvas` is `lazy()`-loaded; `preloadViewer()` is the export the
catalog card calls.

## 4. Panel and overlays

### New in `shared/ui` (spec + Cosmos fixture + Playwright computed-style measurement each)
Model Detail's digest names the same chrome and the v2 page never built it,
so these are new:
- `ToolRail`: 4 px panel, radius 10, `--line-2`, shadow; 30×30 tiles,
  radius 7, mono 12; `active` (accent-soft/accent), `idle` (muted), `inert`
  (dim, `aria-disabled`, no pointer). Each tile carries a unique
  `aria-label`; `role="toolbar"`.
- `ModeChip`: `tone="accent"` (accent border, accent-soft) and
  `tone="neutral"` (line-2, panel, muted); mono 10, tracking 0.1em, padding
  5/11; optional leading icon and trailing `<kbd>`.
- `LodSwitcher`: rail chrome; segments radius 6, padding 4/10, mono 10;
  `active` (accent-soft/accent/600), `shown` (fg + line-2 outline, the level
  on screen while another loads), `idle`; the loading target carries a 5 px
  accent dot. `role="radiogroup"`.
- `StatsStrip`: line-2, radius 10, panel, padding 9/14, mono 10 muted, gap
  14; first span fg; `tone="bad"` swaps the border; `role="status"`.
- `KeycapHint`: chip line, radius 7, panel, padding 4/9, mono 9 muted, `<kbd>`
  line-2 radius 4 padding 1/5 fg.
- `CollapsedRail`: 44 wide, line, radius 12, panel, padding 10/0, gap 12;
  28×28 expand button, vertical overline, vertical pill.
- `Switch`: 34×18, accent track, 14 knob; `role="switch"`, label outside.
`widgets/viewer-toolbar`, `widgets/viewer-panel`, `features/snap`'s
`SnapToggle` and `features/measure`'s `MeasureButton` are superseded and
deleted; their one consumer (`model-detail/model/detail.tsx`) moves to
`entities/scene/model/format.ts`.

### `widgets/overlays-panel`
`<aside aria-label="Overlays">` 320 wide (300 under `max-width: 1280px`),
right/top/bottom 14, line, radius 12, panel, shadow. Head: overline
`Overlays` + 26×26 collapse button (`Collapse Overlays panel`). `Tabs`
`View` / `Placements (N)`. Body slot `flex-1 overflow-auto p-[14px]`.
Collapsed → `CollapsedRail` with `Expand Overlays panel` and `N placed`. The
LOD switcher's right offset is `calc(var(--overlays-w) + 28px)` with one CSS
variable set by the panel state (collapsed: 44 → right 70; open: 320 →
348; 1280: 300 → 326).

### View tab (A)
`DetailList`: `slug` (accent), `units`, `vertices`, `faces`, `uploaded`
(`createdAt` as `4 Sep 2026`, no user — the gateway has none).

### Placements tab
- `SearchField` `Search objects` filters groups and instances by title/label.
- `entities/placement/ui/group-row.tsx`: model title mono 11, sub `N
  instances[ · #k selected]` mono 9, chevron; idle line/panel-2, selected
  accent/accent-soft; click toggles `expandedModel`.
- `entities/placement/ui/instance-row.tsx`: `#k[ · label]`; editor actions
  24×24 `Rename {model} #k` (pencil) and `Delete {model} #k` (trash, bad on
  the selected row) by grant; guest: `Focus {model} #k` text button. Click
  selects (and focuses); the selected row is accent.
- `Button` full width `Add objects to territory` (plus icon) with
  `canCreate`; opens the picker.
- **Selected block** (border-top, gap 11): overline `Selected` + accent
  `{model} #k`; `Segmented` `Translate (T) / Rotate (R) / Scale (S)`
  (`Translate T` … under 1280); grid `auto repeat(3,1fr)` gap 7/8 of three
  `Vec3Field`s (Pos in scene units 3 dp, Rot in degrees, Scl 3 dp) —
  read-only cells while the gizmo drives, inputs in the create form and on
  Rename; `Switch` `Snap to surface` + `<kbd>G</kbd>`.
- **Create form** (state 14): overline `Selected · new`, `Label` `TextField`,
  editable Vec3 grid, `Save` (busy `Saving…`) / `Cancel` (deletes the new
  instance). Rename reuses the form with only `Label` editable.
- Empty (state 7): `EmptyState` inside the body — cube tile, `No objects
  placed yet`, the mock's sentence, the primary button (with `canCreate`).
- Footers: guest `Placing, renaming and deleting objects need the editor
  role. Ask the territory owner for access.`; write-without-delete `Deleting
  placements needs the placement:delete grant.`

### Model picker (state 2b)
`Modal` neutral 720 wide: `Add objects to {title}`, the sentence, `Search
the model library`, the existing `widgets/model-picker` grid (card sub
`{n} LODs · {size}` from `artifacts[]`; a model with an empty chain is
`inert` with `not converted`), footer `Quantity` + `QuantityStepper` (titles
`One fewer {model}` / `One more {model}`), `Cancel`, primary `Place N ×
{model}`; during the loop the primary is busy and a 70×3 line with `Placing
k of N…` sits left of the buttons.

### Header pills and rail per grant
| grants | pill | rail | rows |
|---|---|---|---|
| none of the three | `viewer · read-only` (neutral) + sentence `You can look, measure and open documents.` (A: `…and measure.`) | `↺ ↔ ▶` | Focus |
| write, no delete | `editor · can move, cannot delete` (neutral) | `↺ ↔ ▶` (+`＋` with create) | Rename |
| all three | no pill | `↺ ↔ ＋ ▶` | Rename + Delete |
`measuring` (accent) joins while measure mode is on; `guided tour` (accent)
replaces the meta while the tour runs; `artifact unavailable` (bad) replaces
`ready` in the error state.

### Service states (page-level)
- **Loading (16)**: header skeletons (210×16 title, 66×16 pill, 132×30
  action), viewport panel + grid, centred 380 card `Loading interface…` with
  an indeterminate `ProgressBar` and two `Skeleton` lines. Rendered as the
  route's `pendingComponent` and the widget's `Suspense` fallback.
- **Progressive (3)**: 2 px accent line at the top of the viewport at
  `percent`; chips `Loading model` (accent, spinner) and `coarse LOD {c}
  shown · LOD {t} {p}% · {got} / {total} MB` (neutral); strip's last span
  accent `LOD {c} active · LOD {t} loading`; tools needing geometry inert
  until the coarse level is on screen.
- **Error (6)**: `ErrorState` bad tone centred over the viewport (520 wide):
  `The territory mesh could not be loaded`, body `Storage returned {status}
  for the LOD {n} mesh. The scene, placements and documents are intact — only
  the artifact download failed.` (status from the fetch; `the download
  failed` when there is none), buttons `Try again` / `Load coarse LOD {c}
  instead` (the second only when a coarser level exists), footer mono 10 dim
  `{file} · last attempt {HH:MM}`. Rail inert, no switcher, no panel, strip
  in bad tone: `no geometry loaded · dimensions unavailable · vertices — ·
  faces — · LOD {t} requested`.
- **Measure (4)**: chip with the running total, `Clear` / `Close measurement
  chain`, the hint bar `Click two points · Shift+click removes the chain ·
  Esc exits` spanning to the panel edge, strip lifted to bottom 60.
- **Keycap hints (1)**: `M measure`, `Esc exit / deselect` at bottom-right
  when the panel is collapsed.

### 1280
Panel 300, top bar gap 14 / padding 14/18, h1 ellipsis, no meta line,
switcher at right 326, segmented labels without parentheses, grid cells
padding 6/6. Verified in Cosmos at 1280 and 1440, both themes.

## 5. Testing and the live pass

- Pure modules — table specs: `sceneReady`, `toSceneViewModel`,
  `selectProgressive`, `lodProgress`, `viewerModeReducer` (every key in every
  mode, the three `escape` layers), `groupByModel`, `instanceName`,
  `realWorldScale`, `chain`, `distance`, `unit-ratio`, `measurement-reducer`,
  `tour-state`, `snap-translate`, `is-descendant`.
- Hooks — `renderHook` with mocked gateway modules: `useProgressiveLod`
  (coarse first, swap on ready, a failed hash dropped, a manual target
  change mid-download, the "succeeded frame with a stale cache" case),
  `usePlacementsEditor` (optimistic create → rollback on 4xx, `Placing k of
  N`, selection follows the last created), `useMeasurementTool`, `useTour`,
  `useOverlaysPanel`, `useKeyboardShortcuts`.
- `shared/ui` and widgets — RTL by role and name; a Cosmos fixture per mock
  state; Playwright computed-style measurement in both themes (the reviewer
  measures again and names the surface).
- Three components — `@react-three/test-renderer`: the scene graph after
  mount (one territory root, N instance clones, a `TransformControls` only
  on the selection), `onPick` from a synthetic click, `onTransformCommit`
  after a simulated `dragging-changed`, `focusRequest` refit, token colours
  applied. `gltf-loader-setup.ts`, `ktx2-init.tsx`, `glb-preloader.tsx` go
  on `EXEMPT_MODULES` with a comment naming the WebGL/worker reason; nothing
  else does.
- Route — `catalog-routes` stays exempt; `sceneReady` is the spec.
- Live pass (`live.py` in the SDD directory, on :3001 against :8080):
  `admin` on `dji-wp46-cut` — coarse level first, then LOD0 (both chips and
  the line seen), the switcher, two-point measure in metres, place
  `live-cube` via the picker (`Placing 1 of 2…`), a gizmo drag → exactly one
  `PUT`, Rename, Delete, `Esc` layers, the tour end to end; `guest1` — no
  `＋`, `Focus` refits, the read-only pill; `editor1` — whichever of the
  three grants it holds, the panel matches; `cotest` on `tenant-a-scene` —
  the conversion branch still renders; both themes; screenshots beside the
  mock; 0 document loads across every transition, including a conversion
  that finishes on the page.

## 6. Recorded deviations from the mock

1. `◎ Panoramas`, `▤ Documents`, the View tab's Panoramas and Documents
   sections, and states 8–12 — package B.
2. `Share` — no endpoint.
3. `uploaded` shows the date only — no uploader in the schema.
4. Default LOD target is 0; the mock's `LOD 1 active` in idle states is not
   reproduced.
5. Groups expand into instances; Rename/Delete live on instances.
6. The guest sentence in A reads `You can look and measure.`; B restores
   `…and open documents.`
7. The page heading is an `<h1>` at the mock's `h2` size.
8. `Placing N × model` is N requests; the footer line is the honest
   progress of that loop.

## 7. Not in this package

Panoramas and documents (B). Mobile widths. Distance-based LOD (`Detailed`)
— the level on screen never depends on the camera, as before. A batch
placement endpoint. The production cutover (one nginx root; flip after B).
