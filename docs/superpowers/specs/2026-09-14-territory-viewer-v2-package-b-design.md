# Territory Viewer v2, package B — panoramas and documents

Date: 2026-09-14. Branch: `feat/frontend-v2-design-system` (PR #38, dev ←
branch). Mock: Claude Design project `b5fa4afe-…`, file
`Territory Viewer v2.dc.html`, states 8–13 plus the View-tab sections of
states 3 and 4 and the 16-step tour of state 15 (every measurement, token
and string in `.superpowers/sdd/2026-09-10-territory-viewer-v2/mock-digest.md`;
the code recon this spec leans on is `recon-b.md` beside it). Package A is
`2026-09-10-territory-viewer-v2-design.md`; this spec builds on its viewer
at `e882f3a` and changes none of its decisions.

## Goal

Panoramas and documents leave the old SPA, and with them the last viewer
feature `frontend/` still owns. Inside the v2 viewer at
`/territories/{slug}`: equirectangular panoramas as walk-in views with
their anchors drawn in the scene, an anchor editor with calibration, upload
of both a panorama and a PDF from modals, a floating PDF window over the
scene, per-panorama visibility of placed objects, the external panorama
tour link, and the guided tour grown back to its full length plus the
panorama tour. Nothing in `frontend/` changes; after B the old SPA has
nothing the new one lacks.

## Decisions (user)

- **B-1 Models and markers both.** Inside a panorama the placements
  allowed in it render as their 3D models (the old SPA's behaviour), and
  each carries the mock's viewport marker — a 10 px accent ring with the
  `model #N` label — above it. `Show panorama points` (B-3) toggles the
  markers in both views.
- **B-2 pdf.js, vendored.** `frontend/public/pdfjs/` (6.0.227, 7.4 MB) is
  copied to `frontend-v2/public/pdfjs/` minus the sample PDF, and the
  document window is an `<iframe src="/pdfjs/web/viewer.html?file=…">`.
  One toolbar in every browser, the untrusted PDF isolated in its frame,
  the bytes served only when a document opens. The desktop shell still
  embeds `frontend/`; whoever repoints it carries `pdfjs/` and the
  content-type-keyed CSP over (root `CLAUDE.md`).
- **B-3 Everything the old SPA has.** Beyond the mock: the territory's
  external panorama-tour link (field by `territory:write`, button for any
  reader, http(s) only), the `Show panorama points` switch, the second
  nine-step panorama tour on first entry, and PiP resize from the corner.
- **B-4 Tested like A, plus the live pass.** Every three file under
  `@react-three/test-renderer`; the one new coverage exemption is the
  wrapper over `createImageBitmap`, which `usePanoramaTexture` takes as an
  injected decoder. `live.py` gains a panorama-and-document section.
- **B-5 Look, do not place.** Inside a panorama `↔ Measure` and `＋ Add
  objects` are inert as drawn; the gizmo still moves an object visible in
  that panorama; snap-to-surface is off (the sphere is not a target).
- **One package, FSD port.** `entities/panorama`, `entities/document`,
  `features/panorama-view`, `features/document-view`, the uploads as
  features, three files into `widgets/viewer-canvas/three/`, the View tab
  as `widgets/view-tab`, the modals as `widgets/upload-modal`, the window as
  `widgets/document-window`. Pure domains move with their tests; hooks are
  re-pointed; presentation is written to the mock on `shared/ui`.
- **Skills.** As in A: the standard seven for everyone; three tasks add
  `threejs-fundamentals`, `threejs-interaction`, `threejs-textures`
  (sRGB, flipY, BackSide), `threejs-materials`, `threejs-geometry`.

## 1. Route, modes, keys

- **One route, no new fetches.** `/territories/$slug` stays one page. The
  `/scene` bundle already carries `panoramas[]`, `documents[]` and
  `placements[].visiblePanoramaIds`; the loader adds nothing. The old
  full-page routes `/territories/{slug}/panoramas/new` and
  `/documents/new` are not ported: both uploads are modals inside the
  viewer, as drawn. Any v2 link that still leaves for the old SPA for a
  panorama or a document is re-pointed at the viewer.
- **View state** lives in `features/viewer-mode`. The reducer gains
  `view: { kind: "scene" } | { kind: "panorama"; id: number }`, `move:
  boolean` (drag panorama points, `V`) and `editingPanoramaId: number |
  null` (the anchor card, surviving 3D ↔ panorama). The document is its own
  state in `features/document-view`: `{ id; window: "pip" | "collapsed" |
  "expanded" } | null`.
- **Exclusion rules** (from the old SPA, pure, table-spec'd): entering
  measure deselects and leaves move; entering move leaves measure and
  deselects; opening a document leaves the panorama; entering a panorama
  leaves place and measure.
- **Inside a panorama** (B-5): `↔` and `＋` inert, `◎` active; the gizmo
  works on objects visible there; a click on nothing deselects; snap is
  off; `FocusOn` is inert (the camera is pinned).
- **Escape, layered**: move → an open measure chain → the document
  (expanded → pip, pip → closed) → selection → measure/place → panorama → 3D.
- **Keys**: `P` cycles 3D → panorama 1 → … → 3D; `V` toggles move (a no-op
  without `panorama:write`); A's keys unchanged. No key fires in an input,
  under an open modal or during a tour.
- **Grants**: reads need none. Upload panorama by `panorama:create` (the
  old SPA gated on `panorama:write`, which the POST does not need); edit,
  calibrate and move by `panorama:write`; delete by `panorama:delete`.
  Upload document by `document:write`, delete by `document:delete`.
  Visibility checkboxes by `placement:write`. Root bypasses.
- **Header**: pill `panorama` / `panorama · editing anchor`; meta
  `document overlay open` / `document overlay expanded`.
- **Rail**: `◎ Panoramas` and `▤ Documents` join `railTools`, active when
  their thing is open, and stay clickable in state 3 (LOD loading) and
  state 6 (LOD failed). `◎` opens the View tab expanded and scrolls to the
  Panoramas section; `▤` the same to Documents.

## 2. Data and state

- **`entities/panorama`**: `Panorama { id, slug, title, sourceBlobHash,
  position, yawOffset, defaultYaw, updatedAt }`; gateway `list`, `create`,
  `update`, `remove` over `/api/territories/{slug}/panoramas`. `update`
  always sends title, position, yawOffset and defaultYaw together: the
  gateway's PUT is a full replace and zeroes what is absent. Pure models
  and their tests move from `frontend/src/panorama/domain`: `calibration`
  (`clampOpacity` 0.15–1, `nudgePosition`, `applyCalibration`), `look-yaw`
  (`yawToTarget`, `dirToYaw`), `marker-drag` (the drag reducer),
  `image-signature`, `exif-gps`, `geo-anchor` (`gpsToScenePosition` against
  the source bbox), and from `application`: `read-with-progress`,
  `exif-scene-position` (first 256 KB). Image URL: `assetUrl(hash)`.
- **`entities/document`**: `Document { id, title, sourceBlobHash,
  createdAt }`; gateway `list`, `create`, `remove`; `pdf-signature`. There
  is no PUT: documents are not renamed (§7).
- **`entities/scene`**: `SceneBundle` and `toSceneViewModel` carry
  `panoramas` and `documents`; `Placement` already maps
  `visiblePanoramaIds` (`?? []`); `ResolvedPlacement` carries it through. Every mutation invalidates
  `["scene", slug]`, as in A.
- **`entities/placement`**: `setVisibility(id, panoramaIds)` → `PUT
  …/placements/{id}/visibility`; `create` takes `visiblePanoramaIds`. **An
  object created from the 3D view is created with every current panorama
  id** — visible everywhere by default. The old SPA sent none, and the
  gateway then stored an empty allowlist, "hidden in every panorama"; that
  is a trap, not a feature (§6).
- **`features/panorama-view`**: `usePanoramaView` — the active and the
  editing panorama, `activate(id | null)`, `cycle()`, `toggleView()`,
  `startEdit(id)`, `closeEdit()`; `usePanoramaCalibration` — a draft
  `{ id, position, yawOffset }`, `calibrating` derived (draft.id === editing
  id), `opacity` 0.5 by default, `effective` = the editing panorama with the
  draft applied (what the scene renders), nudge steps Fine 0.005 / Med 0.02
  / Coarse 0.1; `usePanoramaDrag(onCommit)` — move mode with the live
  position mirrored in a ref so `end()` commits once; `usePanoramaTexture
  (hash, decode)` — `fetch` + `readWithProgress` for a real percent,
  `decode` wraps `createImageBitmap(blob, { imageOrientation: "flipY" })`,
  the texture is sRGB with `flipY = false`, `wrapS = Repeat`, `repeat.x =
  -1`, `offset.x = 1`, disposed on change; `showMarkers` in
  `localStorage["andrey.panorama-markers"]`, default on. `Set from camera`
  and `Set default view` read `cameraPositionRef` / `cameraYawRef`, which
  the three layer writes on every OrbitControls `change`.
- **`features/document-view`**: `useDocumentView` — `open(id)` (leaves the
  panorama first), `close()`, `setWindow(pip | collapsed | expanded)`;
  `usePipWindow` — `{ x, y, w, h }`, initial 560 × 400 docked bottom-right
  at the 14 px inset (the mock's; the old SPA's 440 × 560 is not kept),
  minimum 320 × 240, clamped to the viewport on move, resize and window
  resize, drag by the handle, resize by the corner, listeners on `window`.
- **Uploads**: `features/panorama-upload` and `features/document-upload`
  share one hook shape over `runChunkedUpload(file, { contentType:
  file.type, onProgress, signal })`: sniff the first bytes before the
  session opens (JPEG/PNG or `%PDF-`; a wrong file is refused with the
  mock's hint line turned `bad`), upload, then for a panorama read EXIF
  when the GPS box is ticked and `POST` with `sourceBlobHash`, `title`,
  `position` (when the fix lands inside the bbox), `yawOffset: 0`; three
  toasts as in the old SPA: `Panorama placed from GPS`, `Photo location
  doesn't match this territory — set position manually`, `Panorama
  uploaded — set its position manually`. Cancel mid-upload aborts and
  sends `DELETE /api/uploads/{id}`.
- **External link**: `entities/territory` gains `setExternalPanoramaUrl
  (slug, url)` → `PATCH /api/territories/{slug}`; the button renders only
  for an `http:`/`https:` value (`isSafeHttpUrl`), `target="_blank"
  rel="noopener noreferrer"`.
- **Tours**: `VIEWER_TOUR_STEPS` grows to fifteen — the old SPA's sixteen
  minus `user-menu` (§6) — in the old order: intro, catalog-link,
  reset-camera, measure, overlays-tabs, panorama-picker, toggle-markers,
  panorama-marker, move-points, external-link, add-panorama, add-document,
  add-object, objects-list, shortcuts; a step whose anchor is absent is
  skipped at runtime as today. `PANORAMA_TOUR` (`panorama`) has the old
  nine steps — panorama-intro, panorama-view-toggle, panorama-picker,
  panorama-set-from-camera, panorama-yaw, panorama-default-view,
  panorama-save-anchor, panorama-calibrate, panorama-delete — starts the
  first time the reader stands inside a panorama with the viewer tour not
  running, and ends with `POST /api/auth/me/onboarding/panorama`; the seen
  flag comes from `/me` like the viewer's.

## 3. The scene layer — `widgets/viewer-canvas/three/`

- **The boundary holds.** `ViewerCanvasProps` gains `activePanorama:
  Panorama | null` (already draft-overlaid), `panoramas`, `showMarkers`,
  `panoramaOpacity`, `panoramaTexture: Texture | null` with its
  `panoramaStatus`, `move: { active; draggingId; livePos }`,
  `cameraPositionRef`, `cameraYawRef`, and `onActivatePanorama`,
  `onPanoramaError`, `onMarkerGrab`, `onMarkerMove`, `onMarkerDrop`.
  Nothing under `three/` reads a context, the query client or the theme.
- **`panorama-sphere.tsx`**: `<mesh position={anchor} rotation-y=
  {yawOffset}>` with `sphereGeometry [50, 64, 32]` and `meshBasicMaterial
  map side={BackSide} toneMapped={false}`; when opacity < 1 (calibration)
  `transparent`, no depthTest/depthWrite, `renderOrder 1000`. The mesh's
  `raycast` is a no-op so a click past every object reaches
  `onPointerMissed`. Radius 50 is the old SPA's and stays.
- **`panorama-rig.tsx`**: takes the shared OrbitControls — saves target,
  camera position, zoom/pan flags and distance limits; puts the camera at
  the anchor and the target at `yawToTarget(anchor, defaultYaw, 0.01)`;
  disables zoom and pan; on every `change` recentres the eye on the anchor
  keeping the look direction (head rotation, no parallax); a live anchor
  change during calibration re-pins without resetting the look; full
  restore on unmount. `use-gizmo-events` keeps disabling controls during a
  drag.
- **`placements-layer`** inside a panorama renders only placements whose
  `visiblePanoramaIds` holds the active id (B-1) and mounts a `Html`
  viewport marker over each — 10 px ring, 2 px accent on panel, mono 10
  accent label at (14, −6) — when `showMarkers`. In the 3D view the markers
  are the panorama anchors: `panorama-markers-layer` + `panorama-marker`
  (`Html`, `center`, click → `onActivatePanorama(id)`; in move mode
  `pointerdown` → `onMarkerGrab(id)` and the marker draws at `livePos`
  while dragged; `aria-label` `Open panorama {title}` / `Move panorama
  {title}`; `data-tour="panorama-marker"`).
- **`panorama-drag-controller.tsx`**: while `draggingId` — `controls.
  enabled = false`; `pointermove` projects the cursor onto the territory
  (the first BVH hit) and reports `onMarkerMove(point)`; `pointerup` on
  `window` → `onMarkerDrop()`. One PUT per drop, from the feature.
- **`camera-tracker.tsx`**: on `change` writes the camera position and
  `dirToYaw(dir.x, dir.z)` into the two refs; one module-level `Vector3`.
- **`panorama-loading-overlay.tsx`**: a full-canvas cover with the loading
  bar while the texture streams; anchored by a stable `calculatePosition =
  () => [0, 0]` sized to the canvas, never drei's `fullscreen` (it tracks
  the projected origin and slides under `<Bounds>`); its spec moves over.
- **Demand loop**: the rig, the texture swap and the drag call
  `invalidate()`. Colours through `readSceneColors` (accent, panel, fg).
- **Specs**: sphere, rig, markers, tracker and drag under
  `@react-three/test-renderer` with a fake OrbitControls (`target`,
  `enabled`, `enableZoom`, `enablePan`, `addEventListener`,
  `removeEventListener`, `update`); `Html` as a passthrough under
  react-dom as `point-marker.spec` does; the only exemption is
  `three/image-bitmap.ts`.

## 4. Panel, modals, the document window

- **`widgets/view-tab`** replaces the bare `DetailList`: the meta grid (no
  vertices/faces inside a panorama), then **Panoramas** — overline + count
  + a 24 × 24 upload button (`panorama:create`, title `Upload a
  panorama`); the calibration callout (`Drag panorama points on the
  model` + kbd `V` + `Exit calibration`) while calibrating; one row per
  panorama: 44 × 34 thumb (40 × 32 at 1280) showing the image, title, and
  under it `not calibrated yet` (position still `0,0,0` and yaw 0) / `Show
  in this panorama` / on the active row `Exit panorama`; an editor's row
  carries `Edit`; the `Show panorama points` switch; the external link
  block (field by `territory:write`, `Panorama tour` button) — then
  **Documents** — overline + `PDF overlays · N` + upload button
  (`document:write`, title `Upload a document`); rows: file glyph, mono
  name, `Open` (title `Open {file}`); the state 3 and state 8 footers.
- **Anchor card** (state 9), under the rows of the section: `Panorama ·
  editing` + `1 of 2`; `Title`; `Position` with `Set from camera`
  (disabled inside the panorama) and `Vec3Field layout="row"`; `Yaw
  offset` as a degrees field plus a `range`; `Set default view` (enabled
  only inside the panorama, then `Default look: N°`); `Save anchor`
  (disabled until dirty) + `Delete panorama` (bad text button, through
  `ConfirmDialog`); `Enter panorama view` / `Switch to 3D view`. While
  calibrating: `Photo opacity` range with the percent, `Anchor nudge`
  `Segmented` Fine / Med / Coarse, a `− value +` row per axis, `Save` /
  `Exit`. The card re-keys on `id:x,y,z` so a move-drag never leaves a
  stale seeded position for Save to revert. A panorama whose image failed
  shows an amber block in place of the controls.
- **Scrolled indicator** (state 9): `scrolled · metadata above` strip
  under the tabs while the body's `scrollTop > 0`; lives in
  `widgets/overlays-panel`.
- **Upload modals** — `widgets/upload-modal`, one body, two configs:
  `Add a panorama|document to {title}`, close title `Close panorama|
  document upload`; `DropZone` with `.jpg,.jpeg,.png` / `.pdf` and the
  byte sniff; then a `FileCard` with the 4 px progress and `Reading EXIF ·
  38 %` / `Uploading · 38 %`; `Title`; the GPS checkbox for a panorama
  only; footer `Cancel` + `Upload panorama|document`, and while uploading
  `Cancel upload` (bad text button) left, the primary disabled
  `Uploading…`. 520 wide — `Modal size="sm"`.
- **Document window** — `widgets/document-window` on a new
  `shared/ui/viewport-window`: a title bar with the drag handle (`Drag to
  move`), the name, `Expand {file}` / `Restore {file} to a window`, `Hide
  {file}`, `Delete {file}` (`document:delete`, `ConfirmDialog`), `Exit
  document overlay`; the body is the pdf.js iframe, **kept mounted while
  hidden** so page and zoom survive; a transparent shield covers the iframe
  during drag and resize. PiP 560 × 400 bottom-right; expanded fills the
  viewport at the 14 inset; collapsed is a pill beside the stats strip
  (`{file}` + `Show`). The mock's `page 3 / 12 · fit width · 96 %` line is
  not drawn (§6). The scene stays live under the PiP window.
- **Placements tab**: the selected row's sub-block `Visible in` with a
  checkbox per panorama (`placement:write`) and the sentence `Hidden
  objects stay in the 3D scene; only the panorama markers are dropped.`;
  `Add objects to territory` is not drawn inside a panorama (B-5).
- **`shared/ui`**: new `range` (4 px track, accent fill, 14 px knob),
  `viewport-window`, `Modal size="sm"`, icons `panorama`, `file`,
  `maximize`, `minimize`, `grip`, `arrow-up`. Each with a spec, a fixture
  and a Cosmos measurement in both themes.
- **Tours**: fifteen viewer steps and the nine panorama steps on the
  existing `TourOverlay` / `TourTooltip`; the new anchors are the
  `data-tour` ids listed in §2.

## 5. Testing and the live pass

- The A gate unchanged: `yarn lint`, `yarn test:coverage` at 90/85/90/90,
  `yarn build`, `architecture.spec`, the 200-line cap by hand, every three
  file under the test renderer; `exempt-modules.ts` gains only
  `three/image-bitmap.ts`.
- Pure models move with their tests; everything else is spec'd new:
  gateways, `usePanoramaView`, calibration, drag, texture (injected
  decoder: a decode that resolves, one that rejects, a cancelled fetch),
  rig, sphere, markers, tracker, PiP geometry (clamp, minimum, resize),
  both modals (success, refused signature, cancel mid-upload sends the
  DELETE, GPS inside/outside/absent), the window (Hide keeps the iframe
  mounted), the reducer as a table, both tours.
- Cosmos fixtures for mock states 8–13 in `pages/territory-viewer`, and for
  every new primitive; reviewers measure computed style in both themes
  beside the mock.
- **Live pass** (`live.py`, new section, admin then guest1/editor1): a
  generated 4096 × 2048 JPG with EXIF GPS inside the bbox and one without →
  the three toasts; enter the panorama and read the camera position before
  and after a drag (equal to 1e-6); `P` cycles; `Set from camera` disabled
  inside; `Set default view` then `Save anchor` → exactly one PUT carrying
  all four fields; calibration opacity and a nudge; `V` drag of an anchor
  → one PUT; a visibility checkbox → `PUT …/visibility` and the marker
  gone inside the panorama; a PDF upload → `Open` → `viewer.html` answers
  200 and the asset request goes out; Hide / Show / Expand / Restore / Esc;
  Delete by grant; guest1 read-only, editor1 without `panorama:*` sees no
  upload or edit control. Everything created is deleted.
- Pipeline as in A: superpowers subagent-driven, a review after every
  task, a Fable final review, one fix wave, the status table kept after
  every task; commits by path with `--no-verify` and the Frontend-only
  line; push and PR only on request.

## 6. Recorded deviations from the mock and the old SPA

1. A placement created from the 3D view is created visible in every
   panorama (the old SPA created it hidden in all).
2. The document window's `page 3 / 12 · fit width · 96 %` line is not
   drawn: pdf.js does not report it, and its own toolbar carries it.
3. The viewer tour has fifteen steps: the old `user-menu` step has no
   anchor in this shell.
4. The nudge segmented has three steps (Fine / Med / Coarse) as the old
   SPA had; the mock draws two.
5. The PiP window opens at the mock's 560 × 400, not the old SPA's
   440 × 560.
6. The panorama upload button is gated on `panorama:create`, the grant the
   POST needs; the old SPA gated on `panorama:write`.

## 7. Not in this package

- Renaming a document (no `PUT /documents/{id}`).
- A `panorama:read` / `document:read` grant (the gateway has none).
- Gating `PUT /placements/{id}/visibility` on the backend (it is absent
  from `routePerms` today — flagged to the backend owner, not fixed here).
- The desktop shell's switch to `frontend-v2` (carries `pdfjs/` and the
  CSP with it).
- Deep links into a PDF page.
