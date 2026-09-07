# Territory conversion v2 — the pending screen at `/territories/{slug}`

Date: 2026-09-08. Branch: `feat/frontend-v2-design-system` (PR #38, dev ←
branch). Mock: Claude Design project `b5fa4afe-…`, file
`Conversion Pending v2.dc.html` (every measurement, token and string in
`.superpowers/sdd/2026-09-08-conversion-pending-v2/mock-digest.md`; the
ledger directory is git-ignored, the digest is the working copy).

## Goal

The conversion-pending screen leaves the old SPA. `frontend-v2` takes over
`/territories/{slug}` and shows, for a territory whose conversion is queued,
running or failed, the mock's page — live progress, the pipeline, the
worker's message, the way forward. The 3D viewer is not ported; a ready
territory still opens in the old app. Nothing in `frontend/` changes.

## Decisions (user)

- **`/territories/{slug}` lives in v2.** A territory with no LOD0, or with a
  live or failed job, renders this page. Upload Territory and Replace Source
  stop leaving the SPA and navigate here. When the artifacts land *while the
  page is open*, it leaves to the viewer by itself — the promise the mock's
  callout makes.
- **SSE by `jobId`, polling as the fallback.** With `?jobId=` the page
  subscribes to `GET /api/jobs/{id}/events` (a frame per change, the gateway
  polls mesh-api every second). Without one, or when the stream refuses
  (`error` frame for an unknown or foreign id, `onerror`), the page reads the
  same job off `GET /api/jobs` on the existing 5 s poll. Both paths are tested.
- **Territories only.** Model Detail already draws `converting`/`failed` in
  its header and inspector and ignores its `?jobId=`. The mock's copy is
  territory copy; nothing is parameterised.
- **The job outranks the artifacts.** `conversionStatusOf(hasArtifacts, job)`
  — the catalogs' rule — decides: a failed job → `failed`, a live one →
  `converting`, otherwise the artifacts. So a Replace Source conversion shows
  this page while the old revision stays viewable, and the page offers **Open
  the current viewer** when LOD0 exists — a link the mock does not draw,
  added because otherwise a failed replace has no path to a viewer that works.
- **Geometry over diff size.** `ProgressBar` gains `size="lg"` (the mock's
  8 px bar) rather than the page settling for the 6 px one.

## What the backend actually does (measured 2026-09-07)

- **Stage order** (`mesh-service/internal/service/process_job.go`,
  `converter/{raw,convert,convert_lods}.go`): `fetching` 0.05 → `extracting`
  0.20 → `parsing` 0.30 → `encoding` 0.45 → `compressing` 0.55 → `lod-1`
  0.65, `lod-2` 0.80 (simplification, in the converter) → `lod-0` 0.80,
  `lod-1` 0.90, `lod-2` 1.00 (the register pass, in the worker) →
  `registering`, set on the job together with `status=succeeded`. The mock
  puts "Building LOD 0-2" fourth, before encoding and compressing; the worker
  reports it sixth, twice. **The page follows the worker.**
- **A failed job may carry no `stage` and no `progress`.** `cotest`'s
  `tenant-a-scene` job (`GET /api/jobs`, live) is
  `{status: "failed", errorMessage: "fetch/extract source: blob get: blobstore: blob not found"}`
  and nothing else. The mock's "stopped at step 6 of 7" has nothing to read.
- **SSE for an unknown id** answers one `event: error` frame
  (`{"code":"not_found","message":"job not found"}`) and closes. A territory
  job outside the caller's tenant answers the same. The old SPA ignores the
  frame and sits on "Job queued." forever.
- **`GET /api/jobs` drops succeeded jobs**, so "finished" is observed as the
  row leaving the list (`finishedSince`) and the artifacts re-read, exactly as
  the catalogs do.
- **No job on record and no artifacts** is a real state: the reconciler ticks
  every 5 minutes (`reconcileTickInterval`), and a territory created outside
  the upload flow waits for it.
- Progress on the SSE frame and the list row is 0–1 (`TargetJob.progress`);
  `ConversionJob.progress` in `entities/conversion/model/status.ts` is 0–100.
  The page reads `TargetJob`.

## 1. Route and navigation

`app/router/catalog-routes.tsx`: `territoryRoute` under `catalogRoute`,
`path: "/territories/$slug"`, `validateSearch` after the two-factor pattern:
`{ jobId?: string }`, present only when a string. Component:
`TerritoryConversionScreen`. The catalog shell's gate (signed in, `meQuery`)
applies unchanged.

`app/router/guard.ts`: `TERRITORY_PAGE = /^\/territories\/[^/]+$/` beside
`MODEL_PAGE`; `isCatalogHref` matches it (query stripped first, as now). The
doc comment's "deliberately not `/territories/<slug>`" sentence is replaced
by the new rule. `guard.spec.ts:184` flips to `true`, and a case pins
`/territories/x?jobId=abc`.

Four `leaveTo` calls become router navigation:

| file | today | after |
|---|---|---|
| `pages/upload-territory/model/use-upload-territory.ts:100` | `leaveTo('/territories/{slug}?jobId=…')` | `navigate({ to: "/territories/$slug", params, search: { jobId } })` |
| `pages/replace-source/model/use-replace-source.ts:91` | same, after invalidating `["jobs"]`, `["territories"]` | same navigate, invalidations kept |
| `pages/territory-catalog/ui/territory-catalog-screen.tsx:51` | `onOpen={(slug) => leaveTo(territoryPath(slug))}` | `navigate({ href: territoryPath(slug) })` |
| `pages/content/ui/content-screen.tsx:70,110` | `leaveTo(contentPath(item))` | `navigate({ href })` — models already routed in-app through the same path |

`pages/audit/ui/audit-screen.tsx:106` renders anchors; the click delegate
covers it once `isCatalogHref` matches. Both docblocks that say "leaves for
the old SPA's conversion screen" are rewritten. `leaveTo` keeps one caller:
this page's own viewer links.

**A ready territory on first load does not auto-leave.** In dev (3001) a
`location.assign` to the same URL reloads v2 and would loop; in production
v2 is not deployed. The page renders its `ready` state (§4) with a button.
The automatic leave fires only on a **transition observed on this page** —
`shouldLeave(prev, next)` is true when `prev` was `queued | running` and
`next` is `ready`. Never from `failed`, never on mount.

## 2. Data

### `entities/conversion` additions

- `api/job-stream.ts` — `openJobStream(id, handlers): () => void`. Wraps
  `EventSource` on `${API_BASE}/api/jobs/{id}/events` (same-origin, the
  cookie rides along, no header possible — the comment from the old
  `use-job-stream.ts` moves here). `event: job` → `toTargetJob(JSON)` →
  `handlers.onJob`; `event: error` and `source.onerror` → close →
  `handlers.onClose("refused" | "dropped")`; a terminal job (`succeeded` /
  `failed`) closes the source after delivering. A malformed frame is
  ignored. Returns the close function. `EventSource` is taken from
  `globalThis` so a spec can stub it.
- `model/use-job-stream.ts` — `useJobStream(jobId: string | null, slug: string):
  TargetJob | null`. Subscribes while `jobId` is
  set; ignores a frame whose `kind !== "territory" || slug !== slug` (a
  stale or pasted id must not repaint another territory's state); on a
  terminal frame invalidates `["artifacts", "territory", slug]` and
  `["jobs"]`. Unmount closes.
- `model/merge-job.ts` — `mergeJob(streamed: TargetJob | null, polled:
  TargetJob | undefined): TargetJob | undefined`. The stream, once it has
  answered, wins (fresher by four seconds); otherwise the polled row.
- `model/pipeline.ts` — `PIPELINE: { token, label }[]` (seven steps, §3),
  `stepIndexOf(stage: string | null): number` (`lod-N` → the LOD step for any
  N; `registering` → 6; unknown or `null` → −1), `pipelineSteps(stage,
  phase: "queued" | "running" | "failed" | "ready"): PipelineStep[]` and
  `pipelineMeta(stage, phase): string`:
  - queued → every step `pending`, meta `7 steps · none started`
  - ready → every step `done`, meta `7 steps · finished`
  - running, known stage → before `done`, the step `active`, after
    `pending`; meta `step N of 7`
  - running, unknown stage → all `pending`; meta `7 steps · stage not reported`
  - failed, known stage → before `done`, the step `failed`, after `pending`;
    meta `stopped at step N of 7`
  - failed, unknown stage → all `pending`; meta `stopped before the first report`
- `model/status.ts` — `StageState` gains `"failed"`; `STAGE_DOT.failed =
  "bg-bad"`, `STAGE_TEXT.failed = "text-bad"`; `toneClasses` passes it
  through. `StageList` needs no change but renders it correctly.
- `ui/pipeline.tsx` — `Pipeline` (§3).

### `pages/territory-conversion`

`model/conversion-view.ts` (pure):

- `type Phase = "queued" | "running" | "failed" | "ready"`.
- `phaseOf(hasLod0, job): Phase` — over `conversionStatusOf`: `failed` →
  `failed`; `converting` → `job.status === "running" ? "running" : "queued"`;
  `pending` → `queued`; `ready` → `ready`.
- `ledeOf(phase, { hasJob, hasLod0 }): string` — the table in §4.
- `shouldLeave(prev: Phase | null, next: Phase): boolean` — §1.
- `progressCard(job): { title, detail, value? }` — running: `title =
  stageLabel(job.stage)` (`"Queued"` for null is not reached — that is the
  queued phase), `value = round(progress × 100)`, `detail = "NN%"`; progress
  null → `detail = "no progress reported"`, no `value`. queued: `title =
  "Waiting for a worker"`, `detail = "no progress reported"`.

`model/use-territory-conversion.ts` — the container, `useModelDetail`'s
shape:

```
territoryQuery(slug)                    → title, meta; 404 → missing
artifactsQuery("territory", slug)       → hasLod0 = some(a => a.lod === 0)
jobsQuery                               → polled = find(kind==="territory" && slug)
useJobStream(jobId, slug)               → streamed
job = mergeJob(streamed, polled)
phase = phaseOf(hasLod0, job)
```

State union: `loading | missing | unavailable(error) | ready-state &
TerritoryConversionPageProps`. `loading` while any of the three queries is
pending; `missing` on a 404 from the territory query; `unavailable` on
`unanswered(...)` of any — never `isError`. The `finishedSince` effect from
`useModelDetail` is copied verbatim (the polled path's way of noticing the
end). A `useRef<Phase | null>` holds the previous phase; an effect calls
`leaveTo(territoryPath(slug))` when `shouldLeave` says so. `jobId` is read
from the route search and handed in; the page never displays it.

`ui/territory-conversion-page.tsx` — props only:

```ts
type TerritoryConversionPageProps = {
  territory: Territory;
  phase: Phase;
  job: TargetJob | null;      // null: no record
  hasLod0: boolean;
  onOpenViewer: () => void;   // leaveTo, owned by the hook
};
```

`ui/territory-conversion-screen.tsx` — `useParams`, `useSearch`, maps
`loading` (skeleton: title line + one 200 px block, `role="status"`),
`missing` (`EmptyState` "Territory not found" + `← Territory catalog`),
`unavailable` (`Callout tone="bad"` "Territory unavailable: …"), else the
page. `index.ts` exports the screen and the page.

## 3. Components

Reused unchanged: `PageHeader size="lg"` (spacing matches the mock: back →
16 → eyebrow → 10 → title → 8 → meta; the title is 34 px against the mock's
30 — accepted, Replace Source wears the same), `Badge size="sm"` for the
status pill, `Callout tone="warn"`, `Button`, `ThemeToggle variant="compact"`,
`stageLabel`, `conversionStatusOf`, `finishedSince`, `jobsQuery`, `Skeleton`,
`EmptyState`.

### `ProgressBar` — `size?: "md" | "lg"` (`shared/ui/progress-bar`)

`lg` is the mock's card bar: track `h-2` (8 px), `border-line`, `bg-panel-2`,
`rounded-full`; the fill `bg-accent`, no transition drawn in the mock but the
existing `transition-[width]` stays (it does not change geometry). With `lg`
the `label`/`detail` row renders **above** the track: `label` 13 px / 600
`text-fg`, `detail` mono 11 px — `text-accent` when a value is present (the
mock's `58%`), `text-muted` without one (the mock's `no progress reported`)
— `items-baseline justify-between gap-3 flex-wrap`, `mb-3.5` (14 px). `md` is today's
behaviour, untouched, and stays the default. A value of `undefined` under
`lg` renders the row and **no track** — that is the mock's queued card,
which draws no bar ("the system has no indeterminate-bar variant"); the
`md` indeterminate shimmer is not used here. Spec cases: `lg` geometry by
class, row above the track, no track without a value, `md` unchanged.

### `Callout` — `title?: string`, `mono?: boolean` (`shared/ui/callout`)

Today the children go into one `<p class="text-xs">`; the mock's failure
box is an overline plus a paragraph, which `<p>` cannot nest. With `title`
the body becomes a `<div class="min-w-0 flex-1">` holding `<p>` overline
(mono 9 px, tracking 0.2em, uppercase, the tone's colour, `m-0`) and `<p>`
the children (`mt-[7px]`); `mono` puts the children in `font-mono text-xs
leading-[1.55] break-words select-text`. Without `title` nothing changes
for the eleven existing callers. `size="lg"` already gives `items-start
gap-2.5 rounded-card px-4 py-3.5` — the mock's 12 px radius and 14/16 px
padding. `role="alert"` on `bad` stays.

### `Pipeline` (`entities/conversion/ui/pipeline.tsx`)

```ts
type PipelineStep = { label: string; token: string; state: StageState };
type PipelineProps = { steps: PipelineStep[]; label?: string; className?: string };
```

An `<ol aria-label={label ?? "Conversion pipeline"}>`, `flex flex-col
gap-[9px]`, one `<li>` per step, each an `<article>`-less card (the `li` is
the card):

- card: `relative flex items-start gap-3 overflow-hidden rounded-[11px]
  border py-3.5 pr-4 pl-[19px]`; border/ground by state — failed `border-bad
  bg-bad-soft`, active `border-warn bg-warn-soft`, else `border-line bg-panel`
- rail: `absolute inset-y-0 left-0 w-[3px]` in the tone (done `bg-ok`, active
  `bg-warn`, failed `bg-bad`, pending `bg-line-2`), `aria-hidden`
- dot: `mt-[5px] size-2 shrink-0 rounded-full` in the tone; active adds
  `animate-breathe motion-reduce:animate-none` — a new `--animate-breathe:
  breathe 1.8s ease-in-out infinite` + `@keyframes breathe { 0%,100% {
  opacity: 1 } 50% { opacity: .35 } }` in `app/styles/theme.css` beside
  `indeterminate`
- label: `text-[13px]`, `text-fg`, pending `text-muted`
- badge, active/failed only: `rounded-[5px] border px-[7px] py-px font-mono
  text-[9px] uppercase tracking-[0.12em] leading-[1.6] whitespace-nowrap` in
  the tone, text `running` / `failed`
- token, right: `shrink-0 font-mono text-[10px] text-muted whitespace-nowrap`

State is never colour alone: the badge prints the word, and a
visually-hidden `<span>` on done/pending steps says `done` / `not started`.
Fixture: the seven steps in each of the four configurations §2 lists
(queued, running at step 4, failed at step 6, failed with no stage). Spec:
roles, the words, the badge only on active/failed, one `aria-label`.

Lives beside `StageList`, not in `shared/ui`: it is the conversion pipeline's
own card, as `StageList` is its list.

### The seven steps

| # | token shown | label | worker tokens mapped |
|---|---|---|---|
| 1 | `fetching` | Fetching the archive | `fetching` |
| 2 | `extracting` | Extracting files | `extracting` |
| 3 | `parsing` | Parsing OBJ + MTL | `parsing` |
| 4 | `encoding` | Encoding geometry | `encoding` |
| 5 | `compressing` | Compressing textures | `compressing` |
| 6 | `lod-N` | Building LODs | `lod-0`, `lod-1`, `lod-2`, … |
| 7 | `registering` | Registering artifacts | `registering` |

Step 7 is only ever reached on the `succeeded` frame, so it is never
`active` on screen; it is drawn because the mock draws it and the worker
sends it.

### Page layout (`territory-conversion-page.tsx`)

The shell's `<main>` provides `px-9 pt-8 pb-[72px] gap-[22px]`; the page
renders a column `mx-auto flex w-full max-w-[760px] flex-col gap-5`
(the mock's 760 / 20). In order:

1. `PageHeader size="lg"`, `back={{ label: "← Territory catalog", href:
   "/territories" }}`, `eyebrow="Converting"` (all phases — the badge carries
   the state), `title={territory.title}`, `titleBadge=<Badge …>`,
   `meta={`territory · ${slug}`}`, `action=<ThemeToggle variant="compact" />`.
2. Lede `<p class="m-0 max-w-[60ch] text-[13px] leading-[1.6] text-muted">`.
3. failed: `Callout tone="bad" size="lg" title="Worker message" mono` with
   `job.errorMessage`, or `The worker reported no message.` when empty.
4. running/queued: `<section class="flex flex-col gap-3.5 rounded-card border
   bg-panel px-[22px] py-5">` — running `border-accent-line`, queued
   `border-line` — holding `ProgressBar size="lg"` with `progressCard(job)`.
   `ariaLabel="Conversion progress"`.
5. Pipeline heading row `flex items-center gap-3 pb-3 pt-0.5`: `Pipeline`
   13 px / 600, meta mono 10 px muted, a `h-px flex-1 bg-line` rule; then
   `<Pipeline steps={pipelineSteps(job?.stage ?? null, phase)} />`. Under
   `ready` the pipeline is drawn all `done`, meta `7 steps · finished`.
6. failed: the action row `flex flex-wrap gap-[9px]`: `Upload a new source`
   — an `<a href="/territories/{slug}/replace">` in the mock's primary
   geometry (`rounded-control border border-accent bg-accent px-[18px] py-2.5
   text-[13px] font-semibold text-accent-fg no-underline`, the hand-built
   anchor pattern Model Detail's Download GLB already uses, because `Button`
   takes no `href`); `Back to catalog` — `<a href="/territories">` in the
   secondary geometry (`border-line-2 bg-panel-2 text-fg font-medium`);
   `Open the current viewer` — `Button variant="secondary"` calling
   `onOpenViewer`, only when `hasLod0`. Then the note `<p class="m-0
   max-w-[60ch] text-[11px] leading-[1.55] text-muted">`.
   ready: `Open the viewer` — `Button variant="primary"` → `onOpenViewer`;
   `Back to catalog` as above.
7. queued/running: `Callout tone="warn" icon="info"` (the glyph exists),
   12 px text, `rounded-[10px] px-[13px]
   py-[11px]` via `className` — `md`'s `px-3 py-2.5 rounded-[9px]` is 1 px
   off in each, and the page passes the exact values.

Accessible names are unique: the two anchors and the button never share a
label on one screen.

## 4. Copy

| phase | badge | lede |
|---|---|---|
| queued, job on record | `queued` neutral/outline | The archive is uploaded and the job is in the queue. Nothing has been reported yet, so there is no progress to show. |
| queued, no job | `queued` neutral/outline | The archive is uploaded, but no job has been recorded for it yet. The worker picks such territories up on its own within a few minutes. |
| running | `converting` warn/soft | The worker is turning your archive into the compact format the viewer loads. Heavy work happens on the server, not in this tab. |
| failed, no LOD0 | `failed` bad/soft | Conversion stopped, so the viewer has nothing to open. |
| failed, LOD0 | `failed` bad/soft | Conversion stopped, so the viewer has nothing new to open. The previous revision of this territory stays live. |
| ready | `ready` ok/soft | The artifacts are in place. The viewer is still the previous app, so opening it leaves this page. |

Progress card — running: `stageLabel(stage)` · `NN%`, or `no progress
reported` with no bar when progress is null; queued: `Waiting for a worker`
· `no progress reported`.

Failure box: overline `Worker message`, body `errorMessage` or `The worker
reported no message.`

Pipeline meta: §2. Step labels and tokens: §3.

Failed note: `A failed job cannot be restarted on its own — conversion begins
again when a new archive is uploaded for this territory.`

Waiting callout: `This page opens the viewer by itself once the artifacts
land — no need to reload. Closing the tab does not stop the job.`

Header: back `← Territory catalog`; eyebrow `Converting`; meta `territory ·
{slug}`. Missing: `Territory not found`. Unavailable: `Territory
unavailable: {message}`.

## 5. Out of scope

- The 3D viewer. `ready` leaves to the old app.
- Models: Model Detail keeps its inline status.
- Cancelling or restarting a job: no gateway route, not drawn.
- A `<title>`: v2 sets none anywhere.
- `frontend/`'s screen: untouched.

## 6. Testing

- Pure modules, a vitest spec beside each: `pipeline.ts`
  (`stepIndexOf` for every token including `lod-7` and `registering`,
  the five `pipelineSteps` configurations, the six meta strings),
  `merge-job.ts`, `conversion-view.ts` (`phaseOf` over the four statuses and
  both job statuses, `ledeOf` all six rows, `shouldLeave` — true only for
  `queued|running → ready`, false for `null → ready`, `failed → ready`,
  `ready → ready`), `progressCard`.
- `job-stream.spec.ts` with a stubbed `globalThis.EventSource`: a `job` frame
  maps to `TargetJob`; an `error` frame closes and reports `refused`;
  `onerror` closes and reports `dropped`; a terminal frame closes after
  delivery; a malformed frame is ignored; the returned closer closes.
- `use-job-stream.spec.tsx`: no subscription without an id; a frame for
  another slug is dropped; a terminal frame invalidates both keys; unmount
  closes.
- `use-territory-conversion.spec.tsx` (`renderHook`, mocked gateways as the
  sibling hooks do): loading; missing on 404; unavailable on a failed first
  load; **a failed background refetch keeps the page** (`unanswered`); each
  of the six copy rows reaches the page props; the stream outranks the poll;
  `leaveTo` fires on `running → ready` and **not** on a mount that is already
  ready.
- Page and screen specs: roles and names, the badge word, the bar's
  `aria-valuenow`, the box only under `failed`, the callout only under
  `queued|running`, the three link names unique, `Open the current viewer`
  only with LOD0.
- `guard.spec.ts` gains the two territory cases; the four navigation flips
  each get a case in their own hook or screen spec where a navigate is
  asserted and `leaveTo` is not called.
- Fixture `territory-conversion-page.fixture.tsx` wrapped in `CatalogShell`:
  `queued`, `queued-no-job`, `running`, `failed`, `failed-with-viewer`,
  `ready`, `failed-no-stage`. Fixture rows use real gateway shapes — the
  failed one copies `tenant-a-scene`'s live row.
- `Pipeline`, `ProgressBar lg` and `Callout title` each get a spec and a
  fixture and are measured in Cosmos through Playwright by computed style
  (bar height, rail width, badge padding, card padding) before the page uses
  them.
- Every implementer task reports break → red → restore → green, all four
  outputs.
- Live review on 3001 in both themes: `tenant-a-scene` as the real failed
  job (no stage, real message), an upload for the running state, screenshots
  beside the mock, computed-style measurements of the bar, the rails, the
  badges and the column gaps. The reviewer names which surface it measured
  (Cosmos or the live app).
- Gates on a quiet tree: `yarn lint`, `yarn test:coverage` within
  90/85/90/90, `yarn build`.
