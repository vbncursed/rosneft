# Catalog and upload pages — Territory Catalog, Model Library, Upload Territory, Upload Models

Date: 2026-09-05. Branch: `feat/frontend-v2-design-system` (PR #38, dev ←
branch). Mocks: Claude Design project `b5fa4afe-…`, files `Territory Catalog
v2.dc.html`, `Model Library v2.dc.html`, `Upload Territory v2.dc.html`, `Upload
Models v2.dc.html` (summaries with every measurement in
`.superpowers/sdd/2026-09-05-catalog-and-upload-pages/mocks/*.md`; the ledger
directory is git-ignored, the summaries are the working copy).

## Goal

The four screens the old SPA still owns for a signed-in user outside the
console — the two catalogs and the two upload forms — exist in frontend-v2,
built to their v2 mocks, on the real gateway. Missing shared components are
built first in `shared/ui`. Two list fields the mocks need and the gateway
does not serve are added to the backend.

## Decisions (user)

- The pages live in a **new catalog shell**, not the console: routes
  `/territories`, `/territories/new`, `/models`, `/models/new`. "Open →" on a
  card leaves to the old SPA's viewer, as the Content screen does today.
- **Backend gains two counts**: `placementCount` on territories and
  `usageCount` (distinct territories) on models, in the list responses.
- Territory tabs are **by conversion state** (`All · N`, `Ready · N`,
  `Converting · N`); the mock's `Assigned / Company` tabs and the
  `assigned to you` chip are dropped — the territory list is already scoped
  by assignment server-side, and "company" does not exist in the data model.

## Rulings (controller, recorded here so the plan does not re-ask)

- "← Home" on the Model Library and the console's `backHref` point to
  `/territories`: v2 has no Home and none is mocked. The Territory Catalog
  draws no back link — a "← Home" pointing at itself is a dead control
  (amended after the final review). `/` keeps redirecting to `/console`.
- The file card shows `name · size · ZIP`, not `sha256:…` nor
  `OBJ + MTL + N textures`: the hash exists only after finalize and nothing
  inspects the archive client-side.
- Stage lines print a humanised worker token (`Compressing textures`) with
  no ETA; the API carries none. Upload-side ETA/speed/chunk are computed from
  the upload's own byte progress and are the client's numbers.
- Model Library's grid/list toggle is not built: the list view is not
  drawn. The `thumbnail:` and `used:` filter keys and the three tabs are.
- Replace source is a link to the old SPA form (`/territories/{slug}/replace`),
  as Content does; building it is a separate spec.
- Resume across a page reload is not built (the old SPA does not either);
  resume within a session uses the server's `offset` as today.
- Route gate: any signed-in principal reaches the catalogs and the upload
  pages (the old SPA's rule); the upload **actions** and the card actions are
  gated on `territory:write` / `model:write` / `territory:delete` /
  `model:delete`.

## 1. Backend — two counts on the list responses

**proto** (`proto/rosneft/catalog/v1/catalog.proto`): `Territory` gains
`uint32 placement_count = 8;`, `Model` gains `uint32 usage_count = 8;` ("how
many distinct territories place it"). `buf generate`.

**catalog-service**: `domain.Territory.PlacementCount int`,
`domain.Model.UsageCount int`. `ListTerritories` and `ListModels` compute them
in SQL — a correlated `COUNT(*)` over `placements` by `territory_id`, and
`COUNT(DISTINCT territory_id)` over `placements` by `model_id` — and scan them
with a list-specific scanner; the single-entity `Get*` paths leave the fields
zero, and the proto converter sets them from the domain. Integration test
(`-tags=integration`, `postgres:18.6`, beside `delete_model_integration_test.go`):
two territories, one with two placements of one model and one of another,
one with none → `[2, 0]` placement counts; the first model's `usageCount` is
1 (one territory), a model placed in both territories is 2, an unplaced one 0.

**gateway**: JSON `placementCount` / `usageCount` on the list items (the
clients' `toTerritory` / `toModel` map them; `Get` paths may carry 0 —
`openapi.yaml` marks both optional integers on `Territory` / `Model`).
Gateway unit test on the mapping. `yarn openapi:generate` in frontend-v2
regenerates `dto.ts`.

## 2. shared/ui — what is missing

| Component | Shape |
|---|---|
| `Icon` glyphs | `minus` (`M6 12h12`), `grid` (four 7×7 rects), `list` (three bars). |
| `DropZone` | `{ label, hint, buttonLabel, accept, multiple?, disabled?, onFiles(files: File[]) }`. Dashed `border-line-2` panel, upload icon, title 13px/600, hint 12px muted, accent outline pill on the right, a visually-hidden `<input type="file">` the whole panel labels; drag-over sets the accent border; Enter/Space on the focused panel opens the picker. Emits the `File[]` and nothing else. |
| `FileCard` | The chosen-file state of the territory form: accent-soft panel with a 3px accent left border (the `border-l` pattern from `ContentRow`), upload icon, name 14px/600, meta mono 11px, a `Replace` outline pill (`onReplace`). |
| `Checklist` | `{ items: { label, ok }[] }` — `check` in ok / `minus` in muted, text 12px fg or muted. |
| `CatalogCard` (rewrite) | `{ title, description?, slug, tone: "neutral"\|"warn"\|"bad", badge?: { label, tone }, thumbnailUrl?, noImageLabel?, actions?: ReactNode (overlay squares), chips?: { label, tone }[], progress?: { value, stage }, trailing: { label, tone }, meta?: string (sm footer right), href?, onOpen?, size: "md"\|"sm" }`. The title is an `<h3>`; with `href` it wraps an `<a>` (keyboard, new tab, copy link), with only `onOpen` a `<button>`; `onOpen` on the article gives the pointer-anywhere click. Under `sm` the slug sits under the title and the footer is `trailing … meta`. 132px thumb with the grid background and the cube glyph, or the image; the badge top-left; the overlay top-right; body; optional progress+stage; footer `slug … trailing`. `size="sm"` is the Model Library variant (12px radius, 14px title, denser body). The `TerritoryCard`/`ModelCard` entity wrappers had no consumer and were deleted; each page builds its card model itself. |
| `PageHeader` | `size="xl"` (38px, tracking -0.03em, leading 1.05); `description` capped at `max-w-[52ch]` for `xl`, `[56ch]` for `lg`, with `leading-relaxed`. |
| `EmptyState` | Horizontal variant: `icon`, left-aligned title/description, action on the right (the two footer CTAs). Existing centered usage keeps working via a `layout` prop defaulting to the current look. |
| `StageList` (entities/conversion) | Optional `hint` per stage; `activeTone` prop (`warn` default for the existing console use, `accent` for the upload aside). |

Every new component: spec + Cosmos fixture, 200-line cap, tokens only.

## 3. Shell and routes

`widgets/catalog-shell`: `min-h-dvh bg-bg text-fg`, `px-9 pt-8 pb-[72px]`,
`flex flex-col gap-[22px]`; the page header's right slot carries the compact
`ThemeToggle` plus the page's primary action. No sidebar.

`app/router`: `catalogRoute` (`/territories`, `/models` parents) rendering
`CatalogShell` + `Outlet`, with four leaf routes. Gate: signed-in only, as a
pure function in `guard.ts` beside the console one, with a spec. The
console's click delegation (`guard.ts`) also intercepts `/territories` and
`/models` prefixes so links from the console stay in v2; the console's
`backHref` becomes `/territories`.

## 4. Entities

- `entities/upload` (new): `initiateUpload(size, contentType)`,
  `appendChunk(id, offset, blob, signal)` (raw `fetch` with
  `X-CSRF-Token` via `ensureCsrfToken`, `Upload-Offset` header,
  `application/octet-stream`), `finalizeUpload(id)`, `abortUpload(id)`;
  `runChunkedUpload(file, { onProgress, signal })` — `CHUNK_SIZE = 8 MiB`,
  starts at the session's `offset`, aborts between chunks, `onProgress`
  carries `{ bytes, total, chunk, chunks }`; pure `deriveTitle(fileName)`
  (strip `.zip`, trim) and `slugPreview(title)` (lower-case, non-alphanumerics
  to `-`, trimmed — a preview only; the catalog derives the real slug);
  `uploadStats(samples)` → speed and ETA from timestamped byte samples.
- `entities/territory`: `createTerritory({ title, description?,
  externalPanoramaUrl?, sourceBlobHash })` → `{ territory, job }`;
  `Territory.placementCount`.
- `entities/model`: `createModel({ title, description?, sourceBlobHash,
  thumbnailBlobHash? })` → `{ model, job }`; `Model.usageCount`. (A
  `setModelThumbnail` PATCH was planned and dropped: the batch passes the
  thumbnail hash into `createModel`, and nothing on this branch changes a
  thumbnail afterwards.)
- `entities/conversion`: `stageLabel(token)` — `fetching → Fetching source`,
  `extracting → Extracting archive`, `parsing → Parsing OBJ + MTL`,
  `encoding → Encoding geometry`, `compressing → Compressing textures`,
  `lod-N → Building LOD N`, `registering → Registering artifacts`, unknown →
  the token.

## 5. Pages

Each page follows the Content pattern: `pages/<name>/{index.ts, model/*.ts +
spec, model/use-<name>.ts + spec, ui/<name>-page.tsx (props only) + spec,
ui/<name>-screen.tsx + spec, <name>-page.fixture.tsx}`.

### 5.1 `pages/territory-catalog` — `/territories`

Data: `territoriesQuery`, `jobsQuery`, one `artifactsQuery` per territory
(the Content screen's pattern; accepted at tens of rows). Pure
`toTerritoryCard(territory, artifacts, job)`: status via the existing
`toContentItem` rule; chips `N placements` (from `placementCount`, `1
placement`), total size, `panorama` (ok) when `externalPanoramaUrl` is set,
`LOD 0-1` (warn) while converting; `progress` + `stageLabel` while
converting; trailing `Open →` (accent) / `converting` / `unavailable`.
Tabs `All · N`, `Ready · N`, `Converting · N` (Segmented, soft, mono);
FilterBar keys `state:` (`ready|converting|failed|pending`), `panorama:`
(`yes|no`), free text on title/slug. Header: no back link (see Rulings),
overline `Territory catalog`, h1 `Scenes to walk through`, lede as mocked,
primary pill `+ Upload` → `/territories/new` (only with `territory:write`).
Card overlay: Replace (→ old SPA `/territories/{slug}/replace`,
`territory:write`), Delete (`ConfirmDialog`, `territory:delete`, refetch on
success, toast the gateway's message on refusal). Card click / `Open →` →
old SPA `/territories/{slug}` only when ready. Footer CTA `Add another
territory` → `/territories/new` (hidden without `territory:write`).
Loading: skeleton grid; empty: the CTA alone with the lede; unavailable:
bad callout.

### 5.2 `pages/model-library` — `/models`

Data: `modelsQuery`, `jobsQuery`, artifacts per model. Card `size="sm"`,
thumbnail from `thumbnailUrl(model)` else `no image`; badge only while
converting/failed; footer `in N territories` (accent) / `unused` (muted) /
`queued` (warn) / `unavailable` (bad), right the size. Tabs `All · N`,
`In use · N` (usageCount > 0), `No image · N`. FilterBar keys `thumbnail:`
(`none|yes`), `used:` (a number or `0`), `lod:` (as Content). Delete overlay
(`model:delete`; the gateway's 400 "in use by placements" reaches the toast).
`+ Upload` and the footer CTA → `/models/new` (`model:write`). Card click →
old SPA `/models/{slug}` when ready.

### 5.3 `pages/upload-territory` — `/territories/new`

State machine in a hook: `idle → picked → uploading → finalizing →
creating → done | failed | cancelled`. Left: `DropZone` (single ZIP,
`accept=".zip,application/zip"`) or `FileCard` once picked; Details panel
(`SectionHeading` "Details" with count text `slug is generated from the
title`; `TextField` Title required with the `slugPreview` line under it;
`Textarea` Description; `TextField` Panorama tour URL mono with the hint);
progress panel while uploading (`ProgressBar` accent, header
`NN% · x / y · ~m min`, stats `chunk k / n`, `8 MB chunks`, `s MB/s`,
`resumable`, buttons `Uploading…` disabled + `Cancel`); idle button
`Upload territory` enabled when a file and a title exist. Submit:
`runChunkedUpload` → `createTerritory` → `leaveTo(`/territories/${slug}?jobId=${job.id}`)`.
Failure toasts the message and returns to `picked` with the file kept.
Right aside: `StageList` (five stages; `Chunked upload` active while
uploading, `Finalize blob` active while finalizing, the rest pending — the
conversion stages stay pending on this page because the job runs after the
redirect), `Checklist` (four items as mocked), warn `Callout`. No
`territory:write` → the page renders a callout instead of the form.

### 5.4 `pages/upload-models` — `/models/new`

Rows: `{ id, file, title, status: queued|uploading|finalizing|creating|done|failed,
progress, error?, thumbnail?: File }`. `DropZone` multiple; each file becomes
a row with `deriveTitle`; title editable until the row starts; `×` removes a
non-busy row; `thumbnail (optional) · add image` opens an `image/*` picker,
`thumbnail · attached` afterwards. Stat row: `CoverageMeter` (done ok /
uploading accent / queued neutral / failed bad, detail `k of n done`) and
three `StatTile`s (`Archives` n / total size; `Chunk size` `8 MB`; `Failed`
n, bad tone when > 0). Run: sequential; per row `runChunkedUpload(file)` →
(thumbnail: `runChunkedUpload(thumbnail)`) → `createModel` → done; a thrown
row is marked failed with the message and the loop continues. Buttons
`Upload N models` / `Uploading k of n…` + `Cancel batch` (aborts the current
row, the rest stay queued) + the note. Aside: `Current row` card (title,
file · size, four stages, chunk/speed/thumbnail rows), `Checklist`, bad
`Callout` naming the failed rows. Finish: one row → old SPA
`/models/{slug}?jobId=`; several → `/models`. No `model:write` → callout.

## 6. Out of scope

- Replace-source form in v2; resume across reload; ETA from the worker;
  model list view; a v2 Home; the `Assigned/Company` scoping.

## 7. Testing

- Go: catalog integration test for both counts; gateway mapping test;
  `make -C backend check`.
- frontend-v2: spec per module (pure models first — card mapping, tab
  counts, filter keys, batch state machine, `uploadStats`, `slugPreview`,
  `deriveTitle`); hook specs with a stubbed fetch for the chunked upload
  (session offset resume, abort between chunks, thumbnail before create,
  a failed row not stopping the batch); page specs on roles/labels;
  fixtures for every JSX slice; `yarn lint`, `yarn test:coverage` thresholds.
- Live: each page against the compose stack in both themes, screenshot beside
  the mock; a real 8 MB+ ZIP upload through both forms.

## 8. Order of work

1. Backend counts (Go).
2. shared/ui: icons, DropZone, FileCard, Checklist, CatalogCard rewrite,
   PageHeader xl, EmptyState row, StageList hint/tone.
3. CatalogShell + routes + guard + `entities/upload`, `createTerritory`,
   `createModel`, `setModelThumbnail`, `stageLabel`.
4. Territory Catalog page.
5. Model Library page.
6. Upload Territory page.
7. Upload Models page.
8. Final whole-package review.
