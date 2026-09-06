# Model Detail and Replace Source

Date: 2026-09-06. Branch: `feat/frontend-v2-design-system` (PR #38, dev ←
branch). Mocks: Claude Design project `b5fa4afe-…`, files `Model Detail
v2.dc.html` and `Replace Source v2.dc.html` (summaries with every measurement
in `.superpowers/sdd/2026-09-06-model-detail-and-replace-source/mocks/*.md`;
the ledger directory is git-ignored, the summaries are the working copy).

## Goal

Two more screens leave the old SPA: the model page (`/models/{slug}`) and
the territory replace-source form (`/territories/{slug}/replace`), built to
their v2 mocks in the catalog shell, on the real gateway, frontend-only. The
one missing shared component is built first in `shared/ui`.

## Decisions (user)

- **The viewport shows the thumbnail, large.** frontend-v2 has no three.js,
  and the old SPA's model page never rendered 3D either. The mock's viewer
  overlays (tool rail, mode chip, LOD switcher, reset camera, stats strip,
  hint chips) are not drawn; they arrive with the territory-viewer port.
- **Replace source is territories only.** `POST /api/territories/{slug}/source`
  exists; no model counterpart does, and none is added. The model page draws
  no Replace control.
- **Fields the API does not serve are omitted, not added.** No "uploaded by",
  no materials, no source filename, no "Placed in" territory list (only
  `usageCount`), no thumbnail dimensions, no source history, no "+N textures"
  delta, no per-stage ETA from the server.
- **"Place on territory" is not drawn** — nothing in v2 wires it (the rule
  from `frontend-v2/CLAUDE.md`: controls the mocks draw but nothing wires are
  not drawn).

## Rulings (controller)

- Both pages keep the catalog shell's frame (`px-9 pt-8 pb-[72px]`, gap 22).
  The Model Detail mock's `28px 32px 56px` / gap 18 is not reproduced: one
  frame for every catalog screen.
- Replace Source's back link is `← Territory catalog` → `/territories`, not
  the mock's `← Back to {title}`: the territory viewer lives in the old SPA
  and the user arrives from the catalog card.
- "What is preserved" renders through the existing `Checklist`: the one
  not-kept item ("Old LOD artifacts — replaced by the new build") shows the
  component's muted minus, not the mock's warn cross.
- The current source's size comes from `HEAD /api/assets/{hash}`
  (`Content-Length`); the new source's `delta` is that size against the
  picked file's. Both are client numbers; when the HEAD fails the size row
  reads `—` and delta is omitted.
- After a successful replace the page leaves to the old SPA
  (`/territories/{slug}?jobId={job.id}`) exactly as Upload Territory does:
  the conversion screen lives there.
- Artifact rows are download links (one per LOD); "Download GLB" in the header
  is LOD 0. Both are `<a download>` on `/api/assets/{hash}` — same origin,
  the cookie rides along, no blob round trip.
- Thumbnail replace/remove reuses `runChunkedUpload` + `PATCH /api/models/{slug}`
  with `thumbnailBlobHash` (`""` to remove), as the old SPA did.

## 1. shared/ui and widgets

**New `shared/ui/artifact-row`** (the gallery's "Artifact row · LOD 0-2"):
`{ tag: string; file: string; meta: string; size: string; href?: string;
download?: string }`. Row: flex, gap 11px, border line, radius 9px, bg
panel-2, padding 10px 12px. Tag chip: border line-2, radius 5px, padding
2px 7px, mono 9px tracking 0.1em muted. File mono 11px ellipsis; meta mono
10px muted (margin-top 3px); size right mono 10px muted nowrap. With `href`
the row is an `<a>` (`download` attribute set to `download`) with a
focus-visible ring and hover border line-2; without it a `<div>`. No "active"
state — nothing selects a LOD without a viewer. Fixture: three rows, one
linked, one long filename.

**`widgets/page-header` gains two props**: `titleBadge?: ReactNode` rendered
in a flex row beside the h1 (gap 11px, items-center, wrap) and
`meta?: string` — a mono 11px muted line 8px under the title. Fixture adds a
state with both.

Everything else exists: `Badge` (pill ok/warn/bad), `Button` (`shape="icon"
variant="danger"`, secondary), `DetailList`, `Callout`, `Checklist`,
`StageList`, `DropZone`, `FileCard`, `ProgressBar`, `ConfirmDialog`,
`EmptyState`, `Icon` (cube, download, trash, refresh, warning).

## 2. Entities

- `entities/model`: `getModel(slug)` (`GET /api/models/{slug}`),
  `modelQuery(slug)` (key `["model", slug]`),
  `updateModel(slug, { thumbnailBlobHash })` (`PATCH`, returns `Model`).
- `entities/territory`: `getTerritory(slug)`, `territoryQuery(slug)` (key
  `["territory", slug]`), `replaceTerritorySource(slug, sourceBlobHash)`
  (`POST …/source`, 202 → `{ territory, job: { id } }`).
- `entities/content`: `Artifact` widens to `{ lod, hash, size, faces,
  vertices, bboxMin, bboxMax }` (mapped in `artifacts-gateway.ts`; existing
  callers read only `lod`/`size`). New `assetSize(hash): Promise<number | null>`
  — `HEAD /api/assets/{hash}`, `Content-Length` parsed, `null` on any
  failure — and `assetUrl(hash)`.
- `entities/upload`: `UploadProgressPanel` moves here from
  `pages/upload-territory/ui/upload-progress.tsx` with a `submitLabel` prop
  (Upload Territory passes `"Upload territory"`, Replace Source `"Replace
  source"`) and `cancelLabel` (default `"Cancel"`; Replace passes `"Cancel
  upload"`). `progressFor` / `progressLine` move with it into
  `entities/upload/model`. `UploadPhase` stays per page (the two state
  machines differ in their last phase); the panel takes `busy: boolean`
  instead of a phase.

## 3. Shell and routes

- `app/router/guard.ts`: `isCatalogHref` matches the four exact paths **plus**
  `/models/<slug>` (`slug !== "new"`) and `/territories/<slug>/replace`. The
  guard spec's `isCatalogHref("/models/pump") === false` expectation flips.
  `/territories/<slug>` alone still leaves (the viewer).
- Catalog routes move from `routes.tsx` (178 lines) into
  `app/router/catalog-routes.tsx` (added to `EXEMPT_MODULES` beside
  `routes.tsx`); two children added: `/models/$slug` → `ModelDetailScreen`,
  `/territories/$slug/replace` → `ReplaceSourceScreen`. Route titles
  `titleMeta`-style as the neighbours.
- `pages/model-library`: `onOpen` navigates in-app (`useNavigate`) — the card
  `href` already exists. `pages/territory-catalog`: the Replace icon
  navigates in-app to `/territories/{slug}/replace`.

## 4. Model Detail (`pages/model-detail`)

**Data** (`use-model-detail.ts`): `meQuery`, `modelQuery(slug)`,
`artifactsQuery("model", slug)`, `jobsQuery` polled with `pollInterval`
while the model's job `isLive`; the `finishedSince` effect invalidates the
artifacts query as the library does. Status =
`conversionStatusOf(hasArtifacts, job)`. Delete mutation → `DELETE`, then
`navigate("/models")` and invalidate `["models"]`. Thumbnail mutation:
`runChunkedUpload(file)` → `updateModel(slug, { thumbnailBlobHash })` →
invalidate `["model", slug]` and `["models"]`; remove sends `""`. A 404 on
the model renders `EmptyState` "Model not found" with a back link.

**Header** (`PageHeader size="md"`): back `← Model library` → `/models`;
eyebrow `Model`; title; `titleBadge` = `Badge` pill from the status
(`ready` ok / `converting` warn / `failed` bad); `meta` =
`{slug} · {N} LODs · {formatBytes(total)} · created {shortDate(createdAt)}`
(LOD and size segments omitted while there are no artifacts). Actions
(right, gap 9px): `ThemeToggle compact`; `Download GLB` secondary with the
download icon, an `<a download="{slug}-lod0.glb" href={assetUrl(lod0.hash)}>`,
rendered only when LOD 0 exists; Delete — 34px `Button shape="icon"
variant="danger"` with the trash icon, `aria-label="Delete model"`, shown
with `model:delete`, disabled with `title="In use on N territories"` when
`usageCount > 0`; confirms through `ConfirmDialog tone="danger"`.

**Body** grid `lg:grid-cols-[minmax(420px,1fr)_minmax(300px,360px)]`, gap 4.

- **Viewport**: section, border line, radius 14px, bg panel-2, overflow
  hidden, height 560px, the 32px grid background (`--grid` token — add it to
  `theme.css` if absent: rgba(255,255,255,0.05) dark / rgba(0,0,0,0.05)
  light). With a thumbnail: `<img>` `object-contain`, full size, alt = title.
  Without: a 150px cube icon in line-2 centred plus `no image` (mono 10px
  tracking 0.18em uppercase muted) under it.
- **About** card (padding 18px, gap 14px): overline `About`; description
  13px/1.6 or muted `No description.`; `DetailList`: `slug` (accent),
  `triangles` (LOD 0 `faces`, `groupDigits`), `bounds` (`formatSize(bboxMax
  − bboxMin)` from `widgets/viewer-panel`), `hash` (`sha256:{first 4}…{last
  4}`, muted), `placed` (`in N territories` accent / `unused` muted). The
  triangle and bounds rows are omitted without LOD 0.
- **Artifacts** card (gap 12px): overline + right `{N} LODs`; one
  `ArtifactRow` per artifact sorted by lod: tag `LOD n`, file
  `{slug}-lod{n}.glb`, meta `{faces} tris · full detail | mid range | far
  range` (by lod 0/1/2+), size `formatBytes`, `href` = asset URL. No
  artifacts: `EmptyState layout="row"` `Not converted yet` / `Artifacts
  appear when the conversion finishes.` (failed: `Conversion failed` / the
  job's error if any).
- **Thumbnail** card (gap 12px): overline + right action(s) mono 10px
  tracking 0.14em uppercase accent: `replace` (or `upload` when none) and
  `remove` (when present) — buttons over a hidden `<input type=file
  accept="image/*">`; hidden entirely without `model:write`. Body: 62px
  square (border line-2, radius 10px, bg panel-2) holding the image or a
  24px dim cube; caption 11px/1.45 muted `Shown in the library and the
  placement picker.` While a thumbnail uploads the action reads `uploading…`
  and is disabled.
- No "Placed in" card.

## 5. Replace Source (`pages/replace-source`)

**Data** (`use-replace-source.ts`): `meQuery`, `territoryQuery(slug)`,
`useQuery(["asset-size", hash], assetSize)`. Phases `idle → picked →
uploading → finalizing → replacing`; `AbortController` cancels the upload
(the abort path drops the server session as today). On success: invalidate
`["jobs"]`, `["territories"]`, then `leaveTo('/territories/{slug}?jobId={id}')`.
On error: `notify.error(messageOf(e))`, phase back to `picked`, progress
cleared. Without `territory:write` the whole body is a warn `Callout`
(`Replacing a source needs territory:write.`). A 404 → `EmptyState`
`Territory not found`.

**Header** (`PageHeader size="lg"`): back `← Territory catalog`; eyebrow
`Replace source`; title `Swap the 3D source of {title}`; description = the
mock's lede verbatim; action `ThemeToggle compact`.

**Body** grid `lg:grid-cols-[minmax(420px,1fr)_minmax(300px,380px)]`, gap 5.

- **Source pair** grid `repeat(auto-fit, minmax(240px,1fr))`, gap 3:
  - `Current source` card: overline; the API has no filename, so the bold
    14px line is `sha256:{short}`; DetailList `size` (`formatBytes` or `—`)
    and `uploaded` (`shortDate(createdAt)`).
  - `New source` card: before a file — border line dashed, muted `No file
    chosen yet.`; after — border accent, bg accent-soft, overline accent,
    filename bold 14px, DetailList `size`, `selected` (`just now`), `delta`
    (`+/−{formatBytes(|d|)}` accent, omitted when the current size is
    unknown).
- **New archive** panel (padding 22px, gap 16px): section head `New archive`
  13px/600 · `.zip only · OBJ + MTL + textures` mono 10px muted · 1px rule;
  `FileCard` when picked (meta `{size} · ZIP`, `onReplace` while `picked`)
  else `DropZone` (`Drop the new ZIP here` / `Or pick one` / `Choose
  file`); `UploadProgressPanel` (`submitLabel="Replace source"`,
  `cancelLabel="Cancel upload"`, `busy` for uploading/finalizing/replacing,
  submit enabled only in `picked`).
- **Warn callout** (`Callout tone="warn" icon="warning"`): title `The
  territory goes back to converting`; body verbatim from the mock.

**Aside** (sticky, gap 4):
- Pipeline card (the Upload Territory aside's chrome): overline `After the
  upload`, title `Re-convert in place`, `StageList activeTone="accent"` with
  `Chunked upload / 8 MB chunks, resumable`, `Finalize blob / content hash
  written`, `Parse OBJ + MTL / geometry and materials`, `Rebuild LOD 0-2 /
  replaces the old artifacts`, `Swap in viewer / territory returns to
  ready`; the first two move with the phase (`stagesFor` pattern; the
  active upload stage's time is the percentage, then `done`), the rest read
  `queued`, `~1 min`, `~3 min`, `~10 s`.
- `What is preserved` card: `Checklist` — `Slug, title and description`,
  `Territory access assignments`, `Placed models and their coordinates`,
  `Panorama tour link` (ok) and `Old LOD artifacts — replaced by the new
  build` (not ok).
- No source history card.

## 6. Out of scope

Model replace source (needs a backend route); the 3D viewport and its
overlays; editing title/description (the PATCH does not take them); a
"Placed in" list; the mock's page padding on Model Detail.

## 7. Testing

- `shared/ui/artifact-row`: spec (link vs div, `download` attribute,
  ellipsis class) + fixture; Cosmos check via Playwright measuring computed
  border-radius, padding and font-size against the mock.
- `page-header`: spec covers `titleBadge` and `meta` rendering.
- Entities: gateway specs with mocked `fetch` (paths, methods, bodies, the
  HEAD size parse incl. a missing header); `Artifact` mapping.
- Guard: `isCatalogHref` cases — `/models/x` true, `/models/new` true (was),
  `/territories/x` false, `/territories/x/replace` true.
- Pages: hook specs with `renderHook` + mocked entities (status derivation,
  delete flow, thumbnail upload → PATCH, replace phases incl. abort and a
  failing POST); page specs on props (each card, hidden actions without
  grants, empty/failed states). Coverage thresholds 90/85/90/90 hold.
- Live (reviewer): both themes, screenshot beside the mock, console clean;
  Model Detail on a ready and a converting model; thumbnail replace and
  remove on a throwaway model; Replace Source with a real ≥ 8 MB ZIP on a
  throwaway territory, cancel mid-upload, then the full run and the
  redirect with `jobId`; the throwaways deleted.

## 8. Order of work

1. `shared/ui/artifact-row`, `PageHeader` props, `--grid` token. — done
2. Entities: model/territory getters and mutations, `Artifact` widening,
   `assetSize`/`assetUrl`, `UploadProgressPanel` + `progressFor` lifted. — done
3. Guard + the `catalog-routes.tsx` split + in-app links from the two
   catalogs. The two new route entries land with tasks 4 and 5, so no
   placeholder screen is ever committed. — done
4. Model Detail. — done
5. Replace Source. — done
6. Docs: `frontend-v2/CLAUDE.md`, root `CLAUDE.md` screen list, spec tick. — done
