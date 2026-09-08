# Home v2 — the landing page at `/`

Date: 2026-09-08. Branch: `feat/frontend-v2-design-system` (PR #38, dev ←
branch). Mock: Claude Design project `b5fa4afe-…`, file `Home v2.dc.html`
(every measurement, token and string in
`.superpowers/sdd/2026-09-08-home-v2/mock-digest.md`; the code recon that
this spec leans on is `recon.md` beside it; the ledger directory is
git-ignored, both files are the working copies).

## Goal

Home leaves the old SPA. `frontend-v2` takes over `/` and shows the mock's
page: the product header with the upload actions, the conversions in
flight, the most recently touched territories and models, the console
doorways, and the reader's own recent activity. Every block reads what the
gateway already serves; nothing new is asked of the backend. The redirect
from `/` to `/console` goes away. Nothing in `frontend/` changes.

## The three questions the mock was drawn to answer

1. **Greeting or product name** → product name. Eyebrow `Andrey Viewer`,
   h1 `Territories and models`. No username in the header.
2. **In-progress strip or side card** → a full-width strip, its own section
   between the header and Territories, one card per job, absent when there
   is nothing to show.
3. **How many cards before "See all"** → four territories, five models: one
   row at 1280 px with the mock's grid columns (280 / 200 px minimums).

## Decisions (user)

- **Console counters are fetched for the cards the reader can open.** The
  brief's "five endpoints only" rule is relaxed for this one section: an open
  card's hint reads a real count from the entity query that screen already
  uses; a locked card, or one still loading, reads a static line about the
  screen. Cost: up to N+4 requests for an owner (N = territories, for the
  access grants), zero for a Viewer.
- **Console shows when at least one screen is open, with the closed ones
  locked** — the sidebar's "never hidden, disabled" rule. The mock's
  `editor` state hides the section outright; a real editor holding
  `territory:write` has Content and sees it. A principal with no console
  screen at all (Guest, Scene Editor) sees no section.
- **`CatalogCard` is reused as is.** One card per entity in the system, one
  geometry: the catalogs' 132 px thumbnail band, `Open →` trailing, the
  catalog TRAILING/BADGE maps. Home's grids take the mock's columns
  (`minmax(280px,1fr)` gap 14, `minmax(200px,1fr)` gap 12) so 4 + 5 fit one
  row at 1280. The mock's 126 / 104 px bands and `Open {title} →` are
  recorded deviations, not built.
- **The cards are the most recently updated.** `updatedAt` descending,
  entries without a date last, ties by slug. Both entities carry the field.
- **The strip is `GET /api/jobs` verbatim**: territories and models, and
  failed jobs stay until a new source replaces them (locally
  `tenant-a-scene` fails forever, by design). Order running → pending →
  failed, slug within.
- **Sign-in with no `?next=` lands on `/`**, not `/console`. The model
  library's `← Home` link points at `/` instead of `/territories`.
- **FSD is strict.** Layers only inward; a sibling slice only through its
  `index.ts`. The console screen table (`SCREENS`) stays in `app/`; the page
  receives the six items as a prop from the route component, the way
  `ConsoleShell` feeds `ConsoleLayout`. Whatever two pages need lives one
  layer down, once.

## What the backend actually does (measured 2026-09-08)

- `GET /api/territories` and `GET /api/models` answer `ORDER BY slug`.
  Both carry `updatedAt`; both carry `description` (optional).
- `GET /api/jobs` is the latest job per territory or model, succeeded
  excluded, territories tenant-filtered, models for everyone, `no-store`.
  `progress` is 0–1, `stage` a worker token, `errorMessage` optional; a
  failed job may carry neither stage nor progress.
- `GET /api/audit/mine` needs `audit:read_own`. System roles: `admin`
  (Company Owner) and `editor` (Scene Editor) hold it, `guest` does not and
  takes a **403** — the feed's `null` state.
- Upload rights are `territory:write` / `model:write`. Among system roles
  only `admin` holds them; a Scene Editor holds neither. The mock's `editor`
  state (uploads, no console) matches no system role — a custom role with
  `territory:write` shows uploads **and** Content; the matrix below is per
  permission, never per role name.
- `can(me, …)` short-circuits to true for an owner, while the `admin` role
  cannot create a territory (only Root can, `territory:create` is not on it)
  — the catalog draws the upload button for a Company Owner and the POST is
  refused. Home repeats the catalog's gate rather than inventing a second
  one; the trap is recorded, not fixed here.
- Counter sources, each already an entity query: `["users"]`,
  `["roles"]` + `["permissions"]`, `["territory-admins", slug]`,
  `["audit","window",from]` (24 h, capped at `WINDOW_LIMIT` = 200, behind
  `audit:read`), `["metrics","alerts",range]` (`panelQuery` polls every
  30 s in a visible tab by itself). Users have no "invited" state — the
  statuses are `active` / `frozen` / `deleted`.

## 1. Route and navigation

- `app/router/routes.tsx`: `indexRoute` moves under `catalogRoute`
  (`app/router/catalog-routes.tsx`), `path: "/"`, component `HomeRoute`. The
  `redirect({ to: "/console" })` is deleted with its comment. The catalog
  shell's gate (`redirectTarget`, `ensureQueryData(meQuery)`) applies
  unchanged; `consoleIndexRoute` and `consoleLanding` are untouched.
- `app/router/home-route.tsx`: reads `meQuery` from the cache (null branch =
  stale-cache edge, as the shells do) and renders
  `<HomeScreen consoleItems={consoleNav(me)} />`. `consoleNav` and `SCREENS`
  stay where they are.
- `app/router/guard.ts`: `"/"` joins `CATALOG_PATHS` so a link to `/` from a
  console screen stays in the SPA. `guard.spec.ts` pins it.
- `pages/login/model/next-target.ts`: `FALLBACK = "/"`. Its spec and doc
  comment follow.
- `pages/model-library/ui/model-library-page.tsx`: `back` href `/`.
- Console card labels are the `SCREENS` labels — `Roles & Permissions`, not
  the mock's `Roles`. One table, one label.

## 2. The page slice — `pages/home/`

```
pages/home/
  index.ts
  home-page.fixture.tsx           # wrapped in CatalogShell; states below
  model/
    home-view.ts(.spec.ts)        # every decision, pure
    use-home.ts(.spec.tsx)        # the queries
    use-console-counters.ts(.spec.tsx)
  ui/
    home-screen.tsx(.spec.tsx)    # hook → page, navigation
    home-page.tsx(.spec.tsx)      # props only; header + five sections
    jobs-section.tsx, territories-section.tsx, models-section.tsx,
    console-section.tsx, activity-section.tsx (+ specs)
    console-card.tsx(.spec.tsx)
```

`HomeScreen` takes `consoleItems: ConsoleNavItem[]` (type from
`@/widgets/console-nav`) and hands everything else from `useHome()` /
`useConsoleCounters()` to `HomePage`. A page draws no chrome and takes no
shell props. Files stay under the 200-line cap; a section that grows is
split, not squeezed.

### `useHome()`

Queries: `meQuery` (cache-warm), `territoriesQuery`, `modelsQuery`,
`jobsQuery` (5 s poll while any job is live, never hidden),
`artifactsQuery("territory", slug)` via `useQueries` **for the four shown
territories only** (the `combine` shape of `use-territory-catalog.ts`),
`useInfiniteQuery(myAuditQuery)` — first page, sliced to `ACTIVITY_ROWS`
= 4. The audit key is `["audit","mine"]`, shared with `/account`, so the
cache is common and `afterJournalledChange` already invalidates it. Models
get no artifacts query: their card carries no badge, and the trailing reads
off the job and `usageCount` alone.

State:

```ts
export type HomeState = {
  status: "loading" | "ready" | "unavailable";
  error: string | null;
  meta: string;                       // headerMeta
  canUploadTerritory: boolean;        // can(me, "territory:write")
  canUploadModel: boolean;            // can(me, "model:write")
  jobs: JobCardModel[];               // [] hides the section
  jobsMeta: string;
  territories: { cards: TerritoryCardModel[]; total: number; meta: string; viewerEmpty: boolean };
  models: { cards: ModelCardModel[]; total: number; meta: string; shown: boolean };
  activity: AuditEntry[] | null;      // null = could not find out
  activityLoading: boolean;
};
```

- `loading` while territories, models, jobs or the four artifacts are
  pending — all four feed the header line and the cards; `unavailable` only
  through `unanswered(...)` (a first load that never answered), never
  `isError`. Activity and the console counters answer at section level and
  never block the page.
- `finishedSince(prev, next)` on `jobs.data` invalidates
  `["artifacts","territory",slug]` for each target that left the live set —
  copied from the catalog, mandatory, or a conversion finishing on screen
  flips its card back to `pending`.
- `activity`: `null` when `unanswered(feed)` (the Guest's 403, an outage),
  otherwise the slice; `activityLoading = feed.isPending && !feed.data`.

### `useConsoleCounters(items, territories, models)`

One hook so `use-home.ts` stays under the cap. For each item, `enabled:
!item.disabled`; a disabled query stays `isPending` forever, so the hook
reads `isLoading` (the Roles lesson). Returns
`Record<key, ConsoleHint>` where
`ConsoleHint = { kind: "static" | "count" | "unavailable"; text: string }`:

| key | source | count text |
|---|---|---|
| users | `usersQuery` | `12 users` + ` · 1 frozen` when frozen > 0 |
| roles | `rolesQuery`, `permissionsQuery` | `3 roles · 24 permissions` |
| content | territories + models (no query) | `4 territories · 57 models` |
| access | `adminsQuery(slug)` × every territory, summed | `6 grants` |
| audit | `auditWindowQuery(windowStart())` | `184 events · 24h`, `200+ events · 24h` when capped |
| metrics | `panelQuery("alerts", "1h")` → `alertsOf` | `2 alerts firing`, `no alerts firing` |

Static lines (locked, or open and loading): users `people and roles`,
roles `who may do what`, content `territories and models`, access
`who sees which territory`, audit `every change, newest first`, metrics
`conversion health and alerts`. An open query that never answered:
`count unavailable`. Singulars: `1 user`, `1 role`, `1 permission`,
`1 grant`, `1 event`, `1 alert firing`.

`windowStart`, `bucketOf` and `hourOf` move from `pages/audit/model/journal.ts`
to `entities/audit/model/window.ts` (a page may not import a page); the audit
page imports them from the entity, and Home's audit count uses the same 24
buckets the audit page counts, so the two screens agree.

### `home-view.ts` — the decisions

Each is a pure function with its own spec cases.

- `recent<T extends { slug: string; updatedAt?: string }>(items, n)`:
  `updatedAt` descending, undefined last, slug ascending within a tie;
  `TERRITORY_CARDS = 4`, `MODEL_CARDS = 5`.
- `viewerEmpty(territoriesTotal, canUploadTerritory, canUploadModel)`:
  `total === 0 && !canUploadTerritory && !canUploadModel`.
- `headerMeta(territories, models, jobs, viewerEmpty)`: viewer-empty →
  `0 territories assigned · read-only access`; else
  `{n} territories · {m} models · ` followed by `{k} converting` (live
  jobs, both kinds) and `{f} failed` (failed jobs) joined by ` · `, or
  `nothing converting` when both are zero. `1 territory`, `1 model`.
- `territoriesMeta(shown, total, viewerEmpty)`: viewer-empty
  `assigned to you`; total 0 `none yet`; else `showing {shown} of {total}`.
- `seeAll(kind, total)`: `See all 12 territories →` / `See all 57 models →`;
  the link is drawn only when `total > shown`, so the singular is never
  reached.
- `modelsMeta(total)`: `57 in the library`, `1 in the library`, `none yet`.
- `jobsMeta(jobs)`: `2 jobs` / `1 job`, plus ` · updates by itself` **only
  while a job is live** — with failed jobs alone nothing polls and the
  promise would be false.
- `titleOf(territories, models)`: `(kind, slug) => title | undefined`, the
  lookup `toJobCard` is handed.
- `showConsole(items)`: `items.some((i) => !i.disabled)`.
- `bareCard(card)`: the territory card with `chips: []` and `progress`
  dropped — the mock draws neither; the state shows through border, badge
  and trailing. `toTerritoryCard(t, artifacts, job)` itself is the
  catalog's, lifted unchanged.
- Model cards: `toModelCard(m, [], job)` from `entities/model` — no
  artifacts are fetched, so `status` is `converting`/`failed` off the job
  or `pending` otherwise (which the library's badge map does not draw), the
  trailing is `usageTrailing(usageCount)` unless the job overrides it
  (`converting` → `queued` warn, `failed` → `unavailable` bad), the
  thumbnail via `thumbnailUrl`. Home never passes the size meta.

The job-card mapping lives in `entities/conversion/model/job-card.ts`
beside `stageLabel`, because the card is the entity's:

- `toJobCard(job, titleOf)` → `JobCardModel` (see §3.1): status `running` →
  `converting`, `pending` → `queued`, `failed` → `failed`; `title =
  titleOf(kind, slug) ?? slug`; `href = territoryPath | modelPath`; `meta =
  [kind, slug, jobPhrase(job)].join(" · ")`; `percent = Math.round((progress
  ?? 0) * 100)` for running; `error = errorMessage || "The worker reported
  no message."` for failed.
- `jobPhrase(job)`: running with a stage → `stageLabel` with its first
  letter lowered (`building LOD 1`, `compressing textures` — `LOD` keeps its
  case); running without → `waiting for a report`; pending → `waiting for a
  worker`; failed with a stage → `stopped while {lowered label}`; failed
  without → `stopped before the first report` (the conversion page's own
  words).
- `sortJobs(jobs)`: rank running 0, pending 1, failed 2; slug within.

## 3. Sections and states

Page frame is `CatalogShell`'s: `px-9 pt-8 pb-[72px]`, `gap-[22px]`, no
max-width — the first catalog page to sit at the shell's full width, as the
mock does. Loading: the catalog screen's skeleton (`role="status"`,
`aria-busy`, `aria-label="Loading home"`, one 28 px line + two 96 px
blocks). Unavailable: `<Callout tone="bad">Home is unavailable: {error}</Callout>`.

**Header** — `PageHeader size="xl"`, `eyebrow="Andrey Viewer"`,
`title="Territories and models"`, `meta`, no description. `action` =
`<div className="flex flex-wrap items-center gap-[9px]">`: `ThemeToggle
variant="compact"`, then `<AccountPill {...viewer} />` **(round two)** —
the two upload buttons that stood here were removed, the catalogs carry
them (§8 R4).

Every section header is `SectionHeading` (13 px / 600 title, mono 10 px
count, hairline, new `trailing` slot). Trailing links are `<a href>` in
`font-mono text-[10px] uppercase tracking-[0.14em] text-accent`. The
mock's count colour is `--muted`; the component's is `text-dim` and stays —
every section in the app reads that way (deviation recorded).

### 3.1 In progress

Rendered only when `jobs.length > 0`. `SectionHeading title="In progress"
count={jobsMeta}`; list `<ul role="list">` `flex flex-col gap-[9px]`, one
`JobCard` (`entities/conversion/ui/job-card.tsx`) per job:

```ts
export type JobCardModel = {
  kind: TargetKind; slug: string; title: string; href: string;
  status: "converting" | "queued" | "failed";
  meta: string;            // "territory · refinery-block-c · building LOD 1"
  percent?: number;        // converting only
  error?: string;          // failed only
};
```

`<article>` `relative overflow-hidden rounded-[12px] border`,
`pl-5 pr-[17px] py-[15px]`, a 3 px absolute left rail:

| status | border / bg | rail | badge |
|---|---|---|---|
| converting | `border-warn bg-warn-soft` | `bg-warn` | `Badge tone="warn" fill="soft"` `converting` |
| queued | `border-line bg-panel` | `bg-line-2` | `Badge tone="neutral" fill="outline"` `queued` |
| failed | `border-bad bg-bad-soft` | `bg-bad` | `Badge tone="bad" fill="soft"` `failed` |

Badge `shape="pill" size="sm"`. Top row: title `text-sm font-semibold` +
badge (gap 9, wrap), meta `mt-[5px] font-mono text-[10px] text-muted`;
right, the link `Open {title} →` in `font-mono text-[10px] uppercase
tracking-[0.12em] whitespace-nowrap`, `text-accent`, **`text-bad` when
failed**, `aria-label="Open {kind} {slug}"` so two cards never share a name.
Converting: `mt-3 flex items-center gap-[11px]`: `<ProgressBar size="lg"
tone="warn" value={percent} ariaLabel="Conversion of {title}" />` (no
label, no detail — the lg size draws the bare 8 px track then) and the
percent `font-mono text-[11px] text-warn whitespace-nowrap`. Failed: `<p
className="mt-[11px] font-mono text-[11px] leading-[1.5] text-bad
break-words select-text">{error}</p>`. Queued draws neither. Colour never
alone: the badge prints the word.

### 3.2 Territories

`SectionHeading title="Territories" count={territories.meta}` with trailing
`See all {total} territories →` (`/territories`) when `total > 0`
**(round two — was `total > cards.length`; the mock draws the link at 4 of
4, §8 R1)**.
Grid `grid gap-3.5 [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]`
of `TerritoryCard` (`entities/territory/ui`), each with `href` =
`territoryPath(slug)` and `onOpen` navigating there (the conversion page
serves every state, so every card opens).

Empty, viewer-empty: `<EmptyState layout="start" title="No territories are
assigned to you yet" description="Access is granted per territory. Ask your
company owner to assign one — it will appear here as soon as they do." />`,
no trailing. Empty, uploader (the mock does not draw it): the same
component, `No territories yet` / `Upload a source archive and the first
one will appear here.` — the header already offers the upload.

### 3.3 Models

Hidden when `viewerEmpty`. `SectionHeading title="Models"
count={models.meta}` with trailing `See all {total} models →` (`/models`)
when `total > 0` **(round two, §8 R1)**. Grid `grid gap-3
[grid-template-columns:repeat(auto-fill,minmax(200px,1fr))]` of `ModelCard`
(`entities/model/ui`, `CatalogCard size="sm"`), `href` = `modelPath(slug)`.
Empty library: `EmptyState layout="start"` `The library is empty` / `Models
uploaded here can be placed on any territory.`, meta `none yet`.

### 3.4 Console

Rendered when any item is open. `SectionHeading title="Console"
count="company administration"`, trailing `Console →` (`/console`)
**(round two, §8 R5)**. Grid `grid gap-2.5
[grid-template-columns:repeat(auto-fill,minmax(220px,1fr))]` of
`ConsoleCard` (`pages/home/ui/console-card.tsx`):

```ts
export type ConsoleCardProps = { label: string; href: string; hint: ConsoleHint; locked: boolean };
```

Open: the whole card is `<a href>` — `block rounded-[11px] border
border-line bg-panel px-4 py-3.5`, label `text-[13px] font-semibold
text-fg`, right `<Icon name="arrow-right" size={13} className="text-accent" />`
(new glyph, `glyph-extras.tsx`, 24-box `M5 12h14M13 6l6 6-6 6`, stroke 2),
focus-visible ring as `Button` draws it. Locked: `<div aria-disabled="true">`
`bg-panel-2 cursor-not-allowed`, label `text-muted`, `<Icon name="lock"
size={13} title="No access" className="text-muted" />`. Hint below,
`mt-1.5 font-mono text-[10px] text-muted`, `hint.text`; an `unavailable`
hint reads `count unavailable` in the same style. The lock's title is what
tells a screen reader the card is closed, not the colour.

### 3.5 Your recent activity

Always rendered. `SectionHeading title="Your recent activity" count="newest
first"` with trailing `Open account →` (`/account`). Container
`overflow-hidden rounded-[12px] border border-line bg-panel`:

- loading → `<Skeleton height="48px" />` ×2 inside, `role="status"`;
- `null` → `<Callout tone="warn">Your activity could not be loaded.</Callout>`
  in `p-[22px]` (the account page's exact sentence);
- `[]` → `EmptyState layout="start"` `No activity yet` / `Your actions will
  show up here.`;
- rows → `<ul role="list" className="m-0 list-none p-0">` of `ActivityRow`
  (`entities/audit/ui/activity-row.tsx`): `flex items-start gap-3 px-[17px]
  py-[13px] border-b border-line last:border-b-0`; left `min-w-0 flex-1`:
  action `font-mono text-xs truncate`, then `summaryOf(entry)` as a second
  line `font-mono text-[10px] text-muted` when non-empty; right
  `relativeAt(entry.at, now)` `shrink-0 font-mono text-[10px] text-muted
  whitespace-nowrap`. `now` is one `new Date()` per render of the section.

## 4. Library and entity changes

Each `shared/ui` change: its spec, a Cosmos fixture state, and a computed-
style measurement through Playwright (`measure.py`), both themes, in the
implementer's report.

- `SectionHeading`: `trailing?: ReactNode`, rendered after the rule. The
  conversion page's hand-rolled heading (`territory-conversion-page.tsx`
  Pipeline row) switches to it — same 13/600, mono 10, hairline.
- `EmptyState layout="start"`: `rounded-[14px] border border-dashed
  border-line-2 bg-panel p-7 text-left`, title `text-[15px] font-semibold`,
  description `mt-2.5 max-w-[56ch] text-[13px] leading-[1.6] text-muted`,
  `action` below when given. The mock's viewer-empty card, measured:
  28 px padding, 10 px gap.
- `Icon`: `arrow-right` in `glyph-extras.tsx`; `ICON_NAMES` and the icon
  fixture pick it up.
- `ProgressBar size="lg"` with neither label nor detail already renders the
  bare track — a spec case pins that; no change.

Lifts (behaviour and the existing pages' specs unchanged; imports move and
the moved code's spec moves with it):

- `entities/territory/model/territory-card.ts`: `TerritoryCardModel`,
  `toTerritoryCard`, TRAILING, the chip helpers — moved verbatim from
  `pages/territory-catalog/model/catalog.ts`, which keeps `TerritoryTab`,
  `tabCounts`, `matchesTerritory`. `entities/territory/ui/territory-card.tsx`:
  `<TerritoryCard card href onOpen actions? />` = `CatalogCard size="md"`
  with the BADGE/TONE maps moved from `territory-catalog-page.tsx`; that
  page renders it in place of its inline `<CatalogCard>`. Home shapes the
  card with `bareCard` (§2) and the function stays exactly the catalog's.
- `entities/model/model/model-card.ts`: `ModelCardModel`, `usageTrailing`,
  `TRAILING_OVERRIDE`, `toModelCard(model, artifacts, job?)` — moved
  verbatim from `pages/model-library/model/catalog.ts`, which keeps
  `ModelTab`, `tabCounts`, `matchesModel`. `entities/model/ui/model-card.tsx`:
  `<ModelCard card href onOpen meta? actions? />` = `CatalogCard size="sm"`
  with the library's TONE/BADGE maps; the library passes `meta={card.size}`,
  Home passes none (the mock's footer has no size). A converting or failed
  model on Home therefore wears the library's warn/bad border and badge —
  the mock's data has no such model; one card, one reading.
- `entities/audit/model/relative-at.ts`: `relativeAt`, `summaryOf`, `dayOf`
  — `pages/account/model/activity.ts` moved whole; `entities/audit/model/window.ts`:
  `windowStart`, `bucketOf`, `hourOf` from `pages/audit/model/journal.ts`;
  both pages import from the entity.
  `entities/audit/ui/activity-row.tsx`: the `<li>` from
  `pages/account/ui/activity-section.tsx`; that section renders it.
- `entities/conversion/model/job-card.ts`: `JobCardModel`, `jobPhrase`,
  `toJobCard`, `sortJobs`; `entities/conversion/ui/job-card.tsx`.

Entity-to-entity imports go through the sibling's `index.ts`
(`entities/content → entities/conversion` is the precedent).

## 5. Fixtures

`pages/home/home-page.fixture.tsx`, wrapped in `CatalogShell`, states named
as the mock's plus the ones it does not draw: `owner` (2 jobs — a running
territory at 58 % `lod-1` and a failed one with the ktx2 message — 4
territories converting/ready/ready/failed, 5 models, all six console cards
open with counts — an owner opens everything, so the mock's locked Metrics
is not reproduced here — 4 activity rows), `editor` (uploads, no jobs,
Console with Content open and five locked — the locked treatment lives
here),
`viewer-empty` (no uploads, dashed card, no Models, no Console, activity
rows), `quiet` (owner with no jobs), `guest-activity` (activity `null`),
`loading`, `unavailable`, `activity-empty`, `more-than-fits` (12
territories, 8 models — the See-all links). Activity rows come from a live
`GET /api/audit/mine` shape (`auth.login`, `territory.replace_source`,
`model.create`, `placement.update` with empty labels), never invented.
Component fixtures: `job-card` (three statuses, a long error, a long
title), `console-card` (open with count, open static, locked, unavailable),
`activity-row` (with and without a summary line), `section-heading`
(with trailing), `empty-state` (`start`).

## 6. Tests

- `home-view.spec.ts`: `recent` (order, undefined last, slug tie, n
  larger than the list), `headerMeta` × four role shapes and the
  one-of-each singulars, `territoriesMeta`, `modelsMeta`, `jobsMeta` with
  and without a live job, `titleOf`, `showConsole`, `bareCard`,
  `viewerEmpty`.
- `entities/conversion/model/job-card.spec.ts`: `toJobCard` × three
  statuses (percent rounding, `progress: null` → 0, empty `errorMessage` →
  the fallback sentence, unknown title → slug, the two hrefs), `jobPhrase`
  × six cases (`lod-1` keeps `LOD`), `sortJobs`.
- `use-home.spec.tsx` after `use-territory-catalog.spec.tsx`: fresh
  `QueryClient`, `setQueryData(["me"])`, a `fetch` stub router. Cases:
  ready with four artifacts requests and none for the fifth territory; a
  403 on `/api/audit/mine` → `activity: null` while `status: "ready"`; a
  first-load failure of `/api/territories` → `unavailable`; a job leaving
  the live set invalidates that territory's artifacts; the meta line.
- `use-console-counters.spec.tsx`: a locked item makes no request (fetch
  never sees `/api/auth/users`); open items count; a failed open query →
  `unavailable`; audit capped → `200+`; alerts collapse by rule (two
  instances, one alert).
- `home-page.spec.tsx`: what a user observes — the h1, the meta text, the
  two upload buttons present/absent per flag, the strip absent with no
  jobs, See-all present only when more exist, every card link `href`, the
  console grid with locked cards `aria-disabled`, unique accessible names
  across two job cards, the activity tri-state, no `<main>` and no
  `navigation` rendered.
- `home-screen.spec.tsx`: upload buttons and card opens navigate.
- `console-card.spec.tsx`, `job-card.spec.tsx`, `activity-row.spec.tsx`,
  `section-heading.spec.tsx` (trailing), `empty-state.spec.tsx` (start),
  `glyph-extras.spec.tsx` (arrow-right).
- Routing: the route files are exempt wiring (`exempt-modules.ts`), so `/`
  under the catalog shell is proven by the live smoke, not a spec;
  `guard.spec.ts` — `isCatalogHref("/")`; `next-target.spec` — fallback
  `/`; `model-library-page.spec` — back href `/`.
- The lifted modules keep their specs, moved beside them; the source pages'
  specs are unchanged and stay green — that is the proof the lift changed
  nothing.
- `fixtures.spec.tsx` and `architecture.spec.ts` cover the new slices
  without edits.

## 7. Verification

- Gate: `yarn lint` (`tsc -b`), `yarn test:coverage` (90/85/90/90), `yarn
  build`. Line counts hand-checked against the 200-line cap.
- Cosmos measurements (`measure.py`, renderer :5050, both themes): h1 38 px
  / -0.03em / 1.05; section title 13 px / 600; job card rail 3 px, track
  8 px, percent 11 px warn; territory grid 4 columns and model grid 5
  columns at a 1280-wide viewport (1208 content); console card padding
  14/16, hint 10 px; activity row padding 13/17, action 12 px, time 10 px;
  `EmptyState start` 28 px padding. Screenshots beside the mock in the
  ledger.
- Live, on :3001 against the local gateway: `admin` uploads `live-cube`
  and watches the strip go running → gone while the card turns ready
  without a reload (`finishedSince`); `cotest` (Company Owner) sees
  `tenant-a-scene` failed in the strip with the real worker message, four
  console cards open (Users, Roles, Content, Audit) with counts (`2 users`,
  `N roles · M permissions`, `4 territories · 57 models`, `N events · 24h`)
  and Territory access and Metrics locked — a Company Owner answers
  `isOwner: false`, so those two are shut to it on Home exactly as they are
  in the console sidebar — activity rows;
  `guest1` (role `guest`, created for this, no territory) sees the
  viewer-empty page — dashed card, no Models, no Console, the warn callout
  for the 403; `editor1` (role `editor`) sees no uploads, no Console, and
  activity rows. Clicks on the links stay in the SPA (0 document loads).

## 8. Round two (2026-09-09)

The user read the shipped page live and asked for five changes. They are
user decisions, not mock readings, except the account pill — `Home
v2.dc.html`, re-read 2026-09-09, gained one in the header. §3, §3.2, §3.3
and §3.4 above are amended in place with a "(round two)" note.

**R1 — See all draws whenever there is anything to see.** The gate was
`total > cards.length`, so the four-of-four catalog the mock itself draws
had no link out. It is `total > 0` in both sections: a non-empty list
always offers its catalog, an empty one offers nothing (there is nothing
to see, and the empty state already says what to do).

**R2 — the territory catalog gets a way back to Home.** `PageHeader
back={{ label: "← Home", href: "/" }}`, matching the model library, which
has carried it since Home landed. The spec used to say the catalog *is*
the top of the tree; Home is above it now, and both catalogs read the
same.

**R3 — `viewerOf` moves to `shared/session`, and the header gains an
account pill.**

`viewerOf(me): { username, roleTitle }` lived in `app/router/guard.ts`,
which a page may not import — so `pages/account/ui/account-header.tsx`
carried a hand-copied `roleTitleOf` beside it, and Home would have needed
a third. It is one pure function over `Principal` in
`shared/session/principal.ts` now, exported from the barrel and read by
`app/router/console-shell.tsx`, `account-header.tsx` and
`pages/home/model/use-home.ts`. Its cases moved to `principal.spec.ts`.

`widgets/account-pill` is a widget with no domain knowledge: it takes
`{ username, roleTitle }` and imports `shared/ui/avatar` alone. Geometry
from the mock: pill `border --border2`, `bg --panel`, radius 999,
`padding 5px 13px 5px 5px`, gap 9; avatar 28×28 with `border --accent`,
`bg --accent-soft`, `color --accent`; username Archivo 12 px / 500; role
mono 9 px / 0.1em / `--muted`; `aria-label="Open account for {username}"`.

**Deviation:** the mock sets the avatar's initials at 11 px / 600. The
shared `Avatar` is 12 px / 600 for every caller and stays that way — a
per-caller font size would be the first crack in a component the whole app
shares. Measured 12 px in both themes.

`HomeState` and `HomePageProps` gain `viewer`. `me` is cache-warm by the
time Home renders (the route's loader awaited it), so `me === null` is a
stale-cache edge, not a loading state: the pill renders with empty
strings rather than disappearing and moving the header.

**R4 — no upload buttons on Home.** `canUploadTerritory`,
`canUploadModel`, `onUploadTerritory` and `onUploadModel` are gone from
`HomePageProps`, `HomePage`, `HomeScreen` and `HomeState`; `home-page.tsx`
imports no `Button`. Uploading belongs on the catalog that owns the thing
being uploaded, and both catalogs already offer it. `useHome` still
computes the two grants as locals — `viewerEmpty` is "nothing assigned and
nothing you may upload", and that answer has not changed.

**R5 — `Console →` after the Console heading's rule.** The same
`TrailingLink` the two catalogs use, pointing at `/console`, which
resolves the reader's own landing screen (`consoleLanding`) rather than a
constant.

## Recorded deviations (as built)

The ones the mock or this spec names and the code does otherwise, each with
its reason. They are decisions, not defects; a later reader meeting one
should not "fix" it back.

- **§3.5 — the activity skeleton is two 16 px lines with widths (40 % / 55 %),
  not two 48 px blocks.** A 48 px block is a card's placeholder; these rows are
  one line of mono text each, and two full-height blocks promised a heavier
  section than the one that arrives.
- **§5 — there is no `loading`, `unavailable` or `activityLoading` page
  fixture.** Those three are `HomeScreen`'s states, not `HomePage`'s: the page
  takes `activity`/`activityLoading` as props and the other two never reach it
  at all, so a fixture for them would draw a screen the route cannot produce.
  `guestActivity` and `activityEmpty` cover what the page itself decides.
- **§5 — there is no `console-card` component fixture.** The `editor` page
  state draws three of the four hint kinds (open-with-count, locked-static,
  and the open card's arrow) in the geometry they ship in; the fourth,
  `count unavailable`, is covered by `console-hints.spec.ts` and
  `use-console-counters.spec.tsx` alone.
- **§2 — `useConsoleCounters(items)` takes the items and nothing else.** The
  spec's signature threaded `territories` and `models` through from `useHome`;
  the hook reads both from the query cache itself (`territoriesQuery`,
  `modelsQuery` are the same keys `useHome` already primes), so no list is
  passed twice and the Content card cannot disagree with the Territories
  section about how many there are.
- **`headerMeta`'s viewer-empty line stays the mock's string for every
  reader.** `0 territories assigned · read-only access` is printed to a Scene
  Editor with nothing assigned as well as to a Viewer, even though that
  principal holds a write grant somewhere: with nothing to edit, the access it
  has is read-only in effect, and inventing a second sentence for a state the
  mock draws once would be a string nobody designed.

## Out of scope

- A per-route `<title>` — v2 has no mechanism and the mock sets none.
- Console hints the gateway cannot count (`1 invited`, `this month`).
- The old SPA's Home and the 3D viewer.
- The light-theme contrast tokens and the other carried follow-ups.
