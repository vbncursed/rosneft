# CLAUDE.md — frontend-v2

Guidance for Claude Code working in `frontend-v2/`. The redesign SPA, built
against the Claude Design project **Design System.dc.html**. `frontend/` is the
old app and is not being changed.

`README.md` describes the layout and the commands. This file records the
decisions and the traps — the things that cost a session to find.

## How the user wants to work

- **Reply in Russian.** Code, comments, commit messages and PR text stay in
  English.
- **yarn, never npm** — including version lookups (`yarn info <pkg> version`).
  A stray `npm` leaves a `package-lock.json` and a lockfile that no longer
  describes what is installed.
- **Exactly two long-lived branches: `main` and `dev`.** Feature branches merge
  into `dev` first, `dev` into `main` — never a feature branch straight into
  `main`. Delete a feature branch locally *and* on origin once merged
  (`git rev-list --count origin/main..<branch>` must be 0 first).
- **Do not open a PR until asked.** One was opened early and had to be closed.
- The design is the brief. Where a mock pins something down, follow it exactly
  rather than improving on it; raise a concern in a sentence and build what is
  drawn.

## Committing here

A **parallel session works in `backend/`** in the same clone. Two rules follow:

- Stage by path: `git add frontend-v2` — never `git add -A` or `git add .`.
- Check the index before committing: `git diff --cached --name-only`. A
  `git reset --soft` in the other session leaves *its* files staged, and a
  plain `git commit` will sweep them into your commit. This has happened in
  both directions; verify afterwards with
  `git show --stat HEAD | grep -c '^ backend/'` — it must print 0.

`git commit -- frontend-v2` commits only *tracked* changes under that path and
**silently leaves new files behind**. Use `git add frontend-v2 && git commit`,
then check the file count in the commit against what you expected.

Commit with `--no-verify` when the change is frontend-only: the pre-commit hook
runs `make -C backend check`, the repo rule is about *Go* changes, and that
target currently fails on a broken Homebrew llvm (`libz3.4.16.dylib` missing)
regardless of the tree. Say so in the commit message.

The network drops out often (`EHOSTUNREACH`). Retry the push a few times with
`GIT_SSH_COMMAND='ssh -o ConnectTimeout=6'` rather than assuming it failed.

## Traps in the tooling

**`tsc --noEmit` type-checks nothing here.** The root `tsconfig.json` is
solution-style — `files: []` plus `references` — so a bare `tsc --noEmit`
compiles an empty set and exits 0 whatever is in `src`. It passed a
deliberately broken file for weeks. `yarn lint` is `tsc -b --noEmit && oxlint`;
keep the `-b`. If you ever doubt it, feed it
`export const x: number = "no";` and watch it go red.

**The Cosmos decorator must not add padding.** A full-screen fixture — a page,
the console shell — has to reach the edges, and Cosmos *composes* decorators
rather than letting a nested one replace its parent, so a gutter set there
could not be opted out of. Component fixtures carry their own `p-6`; the
page-level ones deliberately do not.

**`lazy` stays `false` in `cosmos.config.json`.** The user asked for it: the
first load is heavy and every fixture after it is instant, which is the right
trade for browsing the library. Do not switch it back on as an optimisation.

**Killing `yarn cosmos` leaves the child alive.** Use
`pkill -f 'node_modules/.bin/cosmos'`. A stray instance holding port 5100 sends
the next one to 5101, and the browser then shows a stale build — this looked
like a performance problem for a whole exchange.

**A brand-new fixture file needs a Cosmos restart; editing an existing one
does not.** With `lazy: false` the server enumerates fixtures once at
startup, so a path created after that answers "Fixture path not found" until
the process is killed (`pkill -f 'node_modules/.bin/cosmos'`) and started
again — `yarn cosmos` picks up the new file on that next boot.

**A failed background refetch does not mean the screen is unavailable.** In
TanStack Query v5 a refetch that trips on a query which already holds data
flips its `status` to "error" while `data` stays exactly where it was — and
every mutation on these screens calls `refresh()`. Deriving "unavailable" from
`isError` therefore blanks a populated page the first time a refresh fails.
Ask `data === undefined` instead: `shared/lib/unanswered`, which both
container hooks use.

**`ConversionStatus` is decided by the job first, the artifacts second.** A
live job from `GET /api/jobs` says `converting`, a failed one `failed`;
otherwise the artifacts decide `ready`/`pending`, and a `succeeded` job is
ignored because they already say it. `jobsQuery` polls every 5 s only while a
job is live (`pollInterval`), never in a hidden tab — a catalog with nothing
converting sends no repeat request at all.

**A Company Owner is absent from its own `/api/auth/users`.** auth-service
filters the list on `created_by`, so the account that created the company is
not in it — a role only owners hold counts "0 users" and its holder never
appears among the faces. That is a backend issue, not something the console
should paper over.

**`Series.values` may hold `null` — a gap, drawn as a break.** A missed scrape
is not a zero: `alignSeries` puts every co-plotted series on the union of
timestamps and leaves the missing samples null so `LineChart` breaks the line
there instead of sloping through an outage. Never fill one in, and never let a
summary read the gap as the last value.

**jsdom 30 has no `HTMLDialogElement.showModal`.** `Modal` and `Drawer` use the
native `<dialog>` on purpose (that is what gives a real browser the focus trap
and the inert background), so `shared/lib/test-setup.ts` carries a small shim.
Do not hand-roll a focus trap to make tests easier.

**`yarn openapi:generate` crashes under `typescript@7.0.2`.**
`openapi-typescript` builds its output through `ts.factory`, which the
TypeScript 7 native port does not expose — its `peerDependencies` say `^5.x`,
so this is not a bug to wait out, the generator never supported 7. The fix is
the scoped `resolutions` entry above (`openapi-typescript/typescript`:
`5.9.3`), which nests a classic compiler for the generator alone and leaves
`tsc -b` on 7.0.2. **Do not "clean up" that entry.** JSON carries no comment,
so a future dependency bump meets an unexplained pin; deleting it fails
nothing today — the build and tests stay green — it only fails the next
person who runs the generator, which may be months later. `frontend/` carries
the identical pin for the identical reason.

**`credentialed` belongs only on the calls that actually answer 401 for a
wrong credential — three of the seven, not all seven.** `shared/api`'s
`SendOpts` carries `credentialed?: boolean`: it means "a 401 from this
request answers the credential just submitted, not the session", and it
suppresses the bounce to `/login`. It replaced a
`location.pathname.startsWith("/login")` sniff that could not tell the two
apart anywhere else. What each call answers for a wrong credential, measured
against the running gateway on 2026-09-07:

| call | wrong credential |
|---|---|
| `login`, `verifyTwoFactor`, `changePassword` | **401** `unauthenticated` |
| `enable2FA`, `disable2FA`, `regenerateRecoveryCodes` | **400** `invalid_input` ("invalid 2fa code") |
| `removePasskey` | **403** `forbidden` ("re-authentication failed") |

So the flag sits on the first three and nowhere else. On the other four a 401
cannot be about the credential — it can only be the session — and suppressing
the bounce there strands a signed-out reader on a page that quietly refuses
everything. The flag went on all seven once, on a symmetry argument nobody
checked against the server; the four were removed on 2026-09-07. Each of the
seven still carries its own test, because the flag is a property of the
*caller*, not of the client, and one shared test cannot cover them all: three
assert a 401 does **not** bounce, four assert it **does**. A mistyped TOTP
code does not sign anyone out — that is a 400, and it never reached the
bounce in the first place. Before putting the flag on a new call, curl the
route with a wrong credential and read the status.

**A page fixture must wrap in the shell its route provides, or Cosmos
misrepresents the page.** `CatalogShell`'s `<main>` carries every bit of the
page padding (`px-9 pb-[72px] pt-8`), so a bare fixture sits flush against
the viewport edge — not a smaller gap, none at all. Ten of the twelve page
fixtures wrap in their shell (`CatalogShell` or `ConsoleLayout`); `login` is
legitimately exempt. This one cost a real round-trip with the user, who
was reading the account page's spacing off a bare Cosmos fixture while
everyone else was measuring the live, correctly-wrapped app — same numbers,
different surfaces, and neither side thought to ask which one the other was
looking at.

## The per-module contract

Every module gets its **own** `*.spec.ts(x)` beside it — not "covered by a
neighbour's test". Every slice that renders JSX gets a `*.fixture.tsx`.

`src/architecture.spec.ts` enforces this, plus: imports point inward across
layers only, no slice reaches past another's `index.ts`, nothing sits loose in
a layer root. `src/fixtures.spec.tsx` renders all of them — Cosmos only loads a
fixture when someone opens it, so a broken one otherwise waits for a person to
click it. Both have caught real breakage; when one goes red it is usually
right.

Specs assert what a user can observe — roles, labels, values, focus — so a
class rename does not break them. The exception is a variant test that
deliberately checks a token class survived.

**The 200-line file cap is hand-checked here** (skip blank lines and comments).
`.oxlintrc.json` declares only `react/rules-of-hooks` and
`react/only-export-components` — there is no `max-lines` rule, unlike
`frontend/`. Nothing will tell you when a file crosses the line; count it
yourself when a file starts to feel long.

## Design decisions that keep coming up

**Source of truth.** `Design System.dc.html` defines the components. The screen
mocks (`Users v2`, `Roles v2`, …) are more specific and win for their own
screen. Where they disagree, prefer the screen — but say so.

Known unresolved disagreements:

- The design system's Users table has no avatar in the row; `Users.dc.html`
  does, and uses a zebra stripe where the system uses an `accent-soft` tint for
  the owner. Built to the design system. **Ask before changing.**
- `dataviz` wants a crosshair and tooltip on line charts; the Metrics mock
  shows neither, so neither was built.

**Colours that were got wrong once.** `tone="accent"` on `Badge` is a *solid*
`border-accent`, not the translucent `accent-line`. A filled neutral chip
carries `text-fg`, not `text-muted` — the outlined one is muted. A secondary
*pill* is transparent; only the control shape takes the raised `panel-2`
ground.

**`clsx` does not merge, and this has bitten the same property three times.**
Two Tailwind utilities for the same property on one element are resolved by
the compiled stylesheet's *source order*, never by the className string's —
so a base string and a variant branch that both set it is not an override, it
is a coin flip decided at build time. Found in `Button`'s pill tracking (a
base `tracking-[0.18em]` and a per-size compound both reached the DOM; fixed
by moving tracking off the base onto each size compound, nowhere else), in
the `{shape:"pill", variant:"link"}` compound that lost to a size compound
declared earlier in the array and has therefore never applied, and in
`ThemeToggle`'s ground (`bg-panel` on the base string, `bg-panel-2` on the
`compact` branch, both landing on the DOM). The rule: one property, one
place; decide per variant, never override with a second utility for the
same property.

**`Modal` has three tones** — `default`, `danger`, `warning` — read off the
`tone` prop and applied to the border and the overline colour alike. The
passkey removal mock's tinted head band, its own close `×`, and a footer
rule are deliberately not reproduced: every dialog in the app wears this one
component, and its chrome is the same everywhere on purpose.

**Archivo ships no Cyrillic subset.** Territory and model names may be Russian,
so those glyphs fall through to the fallback stack. JetBrains Mono does carry
Cyrillic. Still undecided whether to swap the display face.

**Scrollbars are styled once, globally, in `theme.css`** with
`scrollbar-width`/`scrollbar-color` on `*`; do not add `::-webkit-scrollbar`
rules or a per-container class — Chrome disables `scrollbar-color` when the
webkit pseudo-elements are present.

**Home's recorded deviations from `Home v2.dc.html`**: the console table
uses `Roles & Permissions`, the mock's `Roles` — one `SCREENS` label,
already shared with the sidebar; the section count reads `text-dim`, not the
mock's `--muted`, same carried follow-up as everywhere else; the catalogs'
own card geometry stands (132 px thumbnail band, `Open →` trailing, `no
image` in place of the mock's cube), not the mock's 126/104 px bands and
`Open {title} →`; the Users console hint has no "invited" state (the
gateway's only statuses are `active`/`frozen`/`deleted`) and the Audit hint
carries `· 24h`; six console cards wrap at 1280 px on the mock's own
`minmax(220px,1fr)` — not a bug, the mock itself does.

## Patterns to follow, not re-derive

- **A page draws no chrome.** Console screens render inside
  `widgets/console-layout`, applied by the route; the page returns a fragment
  of its own content and takes no `nav`/`viewer` props. Its spec asserts that
  no `navigation` and no `<main>` come out of it.
- **The sidebar is two elements.** The outer one is a plain grid item so the
  panel fill reaches the bottom of a long page; the inner one is
  `sticky top-0 h-dvh` so the contents hold their place. One element cannot do
  both.
- **Inspector on the right, sticky, and absent until its data is loaded.** A
  selected id with no detail yet renders no panel — never a half-empty one.
- **Groups hide when empty; the whole list answers with a sentence.** "No one
  matches this filter." plus a way forward, never a blank frame.
- **Accessible names must be unique on screen.** Several rows of "Manage" or
  two permission chips both named "write" are indistinguishable to a screen
  reader. Name the control after its subject (`Manage access to X`,
  `territory:write`). Tests have caught this twice.
- **Never carry state on colour alone.** A severity prints its word, a weak
  password gets an off-screen sentence, a conversion stage is toned in the text
  as well as the dot.
- **"Loading" and "unavailable" are different states.** Collapsing them hides
  an outage behind a spinner. Same for tri-state `totpEnabled`/`passkeyEnabled`
  — `null` means "we could not find out", and a confident wrong "No" is the bug
  the shape exists to prevent.
- **A decision that needs a test goes in a pure function.** `diffRows`,
  `grantShare`, `matchesFilters`, `toLinePath`, `isRevocable`, `parseFilters`,
  `journal.ts`, `dashboard.ts`.
  The component then reads as markup.
- Charts: every series on one chart shares one maximum, or a flat line looks
  like a mountain beside a real one. A single reading draws as a flat segment,
  a flat-zero series sits on the baseline rather than dividing by zero.
- **A card an entity owns lives in that entity, not in the page that first
  drew it.** `TerritoryCard`/`toTerritoryCard` (`entities/territory`),
  `ModelCard`/`toModelCard` (`entities/model`), `JobCard`/`toJobCard`/
  `jobPhrase` (`entities/conversion`), `ActivityRow`/`relativeAt`/
  `summaryOf`/`windowStart`/`bucketOf` (`entities/audit`) — the catalogs, the
  account feed and the audit page all import them from there, not from each
  other. `ActivityRow` takes a `className` and sets no padding of its own;
  the caller spaces its own rows. `SectionHeading` has a `trailing` slot
  after the rule, and `EmptyState` has a `layout="start"` variant, both
  reused rather than re-derived per page.

## Where things live

See README for the full table. Shorthand: `shared/ui` has no domain knowledge;
`entities/*` own a business object and its row/card; `features/*` are user
actions; `widgets/*` are assembled blocks; `pages/*` compose through props, and
a container hook in `pages/*/model` is what fetches for them — `useLogin` is
the one that exists.

## What is wired

Login works against the real gateway. `shared/api` is the HTTP client, the CSRF
header and the 401 bounce; `shared/session` holds the marker and the
`Principal`; `entities/user/api` has the auth gateway, its DTO→domain mapper
and `meQuery`; `app/router` is the route tree and the guard; `app/query` the
query client.

**Every console screen and all six catalog screens are live.** Each is a
container hook in `pages/*/model` (`useUsers`, `useRoles`, `useContent`,
`useTerritoryAccess`, `useAudit`, `useMetrics`, `useTerritoryCatalog`,
`useModelLibrary`, `useUploadTerritory`, `useUploadModels`, `useModelDetail`,
`useReplaceSource`) that owns the queries, the mutations and the UI state,
a `*-screen.tsx` that maps it onto
the props-only page and draws the dialogs
beside it, and a pure module (`people.ts`, `roles-view.ts`, `catalog.ts`,
`access-view.ts`) holding every decision. Outcomes report through
`shared/lib/notify`; `ConsoleShell` mounts the Toaster once, around the whole
console. Copy that split rather than re-deriving it — every screen here has
the same shape, and the next one should too.

**Content** is two lists, one artifacts query per row and one `GET /api/jobs`
over all of them, and a row's status is read off its job and its artifacts —
so the screen is ready only when every one of them has answered; guessing
would print "pending" for something merely still loading. A conversion is
visible while it runs: the row turns `converting` with the worker's percentage
and stage, the inspector draws the bar and the note, a failure puts the
worker's message at the top of the inspector, and a row whose job just left
the live set re-reads its own artifacts (`finishedSince`) so LODs and size
catch up.

**The catalogs** (`/territories`, `/models`) share Content's shape — the list
plus one artifacts query per row plus one `GET /api/jobs` — and layer them
through the one shared rule, `conversionStatusOf` in `entities/content`: a
failed job wins outright, a live job reads `converting`, otherwise the
artifacts decide ready/pending. Both carry the `finishedSince` effect, without
which a conversion finishing on screen flips the card backwards to "pending".
Every card is a link to its page — the conversion page is where a pending,
converting or failed territory lands, so there is no longer a state a card has
to refuse to open into, and no `openable` field to carry the answer.
`placementCount` and `usageCount` are on the list and single-entity GETs
alike (added on this branch); `usageCount` counts *distinct territories*, not
placements, and is a global aggregate because the model library is shared by
decision. **The
uploads** (`/territories/new`, `/models/new`) drive the gateway's resumable
protocol through `entities/upload`'s `runChunkedUpload` — 8 MB chunks from the
session's own offset, `X-CSRF-Token` on every PATCH, and one `abortUpload` in
the function's own catch so no caller has to remember it. The batch page runs
one row at a time; a throw fails that row and the loop continues, a cancel
fails the row and stops. `UploadProgressPanel` (with `progressFor`/
`progressLine`) lives in `entities/upload` too, shared by Upload Territory
and Replace Source; each page keeps its own `UploadPhase` (their last phase
differs) and hands the panel a plain `busy: boolean` instead.

**Model Detail** (`/models/{slug}`) shows the thumbnail as the viewport, full
size — frontend-v2 has no three.js, and the old SPA's model page never
rendered 3D either, so the mock's viewer overlays (tool rail, LOD switcher,
stats strip, …) wait for the territory-viewer port. `Download GLB` and the
per-LOD artifact rows are `<a download>` on `/api/assets/{hash}`; Delete is
gated on `usageCount`, read straight off the single-model fetch —
`GET /api/models/{slug}` carries it now, so the page no longer fetches the
whole library for one number. **Replace Source**
(`/territories/{slug}/replace`) is territories only:
`POST /api/territories/{slug}/source` exists, no model counterpart does, and
the model page draws no Replace control. The current source's size comes
from `HEAD /api/assets/{hash}`; a successful replace navigates to this page's
own `/territories/{slug}?jobId={job.id}`, exactly like Upload Territory —
neither leaves the SPA any more.

**Territory conversion** (`/territories/{slug}`) is three queries plus one
stream: the territory, its artifacts, `GET /api/jobs`, and — with `?jobId=` —
the job's SSE channel (`openJobStream`/`useJobStream` in `entities/conversion`).
The stream, once it has answered, outranks the polled row; when the channel
is lost (the gateway's `event: error` for an unknown or foreign id, or a
dropped connection) the hook forgets its frame so the poll wins again.
**A page that mounts already ready does not leave** — `shouldLeave(prev, next)`
fires only on `queued|running → ready` watched on this page, because in dev a
`location.assign` to the same URL reloads v2 and would loop. The pipeline's
`<ol>` and the failure box are the mock's; the step order is the worker's real
one (`entities/conversion/model/pipeline.ts`), not the mock's: `lod-N` comes
after encoding and compressing and arrives twice, and `registering` only with
`succeeded`. **A failed job may carry no stage and no progress** —
`tenant-a-scene`'s live row is exactly that — so the meta line has a
`stopped before the first report` form and no step is marked; its pipeline is
exactly as blank as a freshly-queued job's, so the two are told apart only by
that meta line and the failure box, never by the steps themselves. Upload
Territory and Replace Source navigate here instead of leaving; `leaveTo` has
one caller left, this page.

**Home** (`/`, `pages/home`) is the landing screen. `useHome` owns three
lists (territories, models, jobs), the jobs poll, one artifacts query per
*shown* territory — the four most recently updated, `recent(...)` in
`home-view.ts`, never the rest — and the first page of `myAuditQuery`
sliced to `ACTIVITY_ROWS` (4). The feed never blocks the page: `activity` is
`null` when unanswered (a Guest's 403), exactly the tri-state `/account`
already reads. `finishedSince` invalidates a *shown* territory's artifacts
when its job leaves the live set, same as Content and the catalogs.
`useConsoleCounters` counts only the cards the reader can open — each query
is `enabled: !item.disabled`, and reads `isLoading` rather than `isPending`
because a disabled query stays pending forever (the Roles lesson); a locked
or still-loading card reads `STATIC_HINTS[key]`, an open query that never
answered reads "count unavailable", and Access fans out one `adminsQuery`
per territory — the same shape `/console/access` already uses, so an owner's
Access card costs one `adminsQuery` per territory on every mount, exactly what
that screen costs. A background territories refetch that brings a *new*
territory into the four mounts a new artifacts query, and the page drops to the
skeleton for that one round-trip — the catalog's own trade-off, because a
screen that is ready only when every artifacts query has answered is the one
that never prints "pending" for something merely still loading. `viewerEmpty`
(no territories, no upload right of either kind) hides Models and switches
the header and territories meta lines. The console items come **down from
the route**: `app/router/home-route.tsx` hands `consoleNav(me)` to
`HomeScreen` as a prop because `SCREENS` lives in `app/router/guard.ts` and
a page may not import it. A Company Owner answers `isOwner: false`, so its
Territory access and Metrics cards are locked on Home exactly as they are in
the console sidebar.

**Home draws no upload button** (round two, 2026-09-09). Uploading belongs
on the catalog that owns the thing uploaded, and both catalogs offer it, so
`HomePageProps` carries no `canUpload*`/`onUpload*` and `home-page.tsx`
imports no `Button` — `useHome` still computes the two grants as locals
because `viewerEmpty` means "nothing assigned and nothing you may upload".
The header carries `widgets/account-pill` instead: a link to `/account`
with the avatar, username and role title, fed by `viewerOf(me)`. **`viewerOf`
has exactly one definition, `shared/session/principal.ts`** — it used to sit
in `app/router/guard.ts`, which a page may not import, so `/account`'s
header kept a hand-copied `roleTitleOf` beside it; the console shell, the
account header and `useHome` all read the one copy now. Both See-all links
draw whenever their list is non-empty (`total > 0`, not `total > cards.length`
— the mock's own four-of-four catalog had no way out), the Console heading
carries a `Console →` trailing link, and `/territories` has the `← Home`
back link `/models` already had.

**Round three (2026-09-09): the account page's way back is Home, and the
sidebar says Console once.** `pages/account/ui/account-header.tsx`'s back
link read `← Back to console` → `/console`; the console has its own way in
now (the sidebar's identity link), so it is `← Home` → `/`, same wording as
the catalogs above. `widgets/console-nav/ui/console-nav.tsx` also drew an
accent overline reading `Console` between the back link and the first item
— dropped, because the `<nav aria-label="Console">` landmark already names
the region and `console-sidebar.tsx`'s brand-row `Console` label is the one
visible instance the user keeps. Only one "Console" text now shows inside
the console sidebar.

**Territory access** is the territories list, the users list and one
admins query per territory; visibility is derived (anyone assigned →
`assigned`, nobody → `private`), every grant is `direct`, drafts are kept per
slug so switching territories loses no edit, and Save is one PUT of the whole
set followed by invalidating that territory's admins query alone.

**Audit** is one infinite query keyed by the parsed filters, plus its own
24-hour window query for the counters above the list — a filter narrows the
journal and never moves them. It follows only while the first page is the only
one: refetching N pages every 30 s is not "live", so paging older stops the
poll, and a hidden tab sends nothing. **Metrics** is one query per panel, all
keyed on the range the URL holds (`?range=`, validated in the route, `1h` by
default), each polled every 30 s in a visible tab. The health list is
synthesised from the `services-up` panel plus the RED panels rather than
fetched; alerts are summarised from their own labels. A panel that failed is
one dark card reading "unavailable — <message>", and only a dashboard where
*every* panel failed is unavailable — one dead panel must not blank a working
screen.

Rulings from those screens that a later one will meet again:

- **Reset password is not rendered.** No endpoint wires it, and an action with
  no endpoint is not drawn.
- **No owner toggle** — not drawn in the mocks, so not built. The endpoint
  exists (`POST /api/auth/users/{id}/owner`) and is deliberately left unwired
  (plan ruling 5); this is not the "an action with no endpoint is not drawn"
  rule.
- **Role delete is wired.** The role inspector offers Delete for a custom role
  to `roles:manage` holders, disabled with a holder-count hint
  (`aria-describedby`) while people still hold the role, and confirmed through
  `ConfirmDialog`. The backend answers 422 `role is still assigned to users`
  when holders exist (SQLSTATE 23001, auth-service).
- **A role's people count is unknown, not zero, without `users:read`.** The
  people query is `enabled` on that grant, so it is never requested; the card
  reads "— users" and the distribution meter "unavailable". A disabled query
  stays `isPending` forever, so `isLoading` is what "loading" asks — otherwise
  a non-reader waits on a spinner that never resolves.
- **Controls the mocks draw but nothing wires are not drawn.** No replace-source
  for a model (no gateway route), no cancel-job (none either), no visibility
  switch on the access inspector (`assigned`/`company`/`private` is derived
  from the admins list, and the gateway has no visibility field), no bulk
  assign (the admins PUT is per territory). Both widgets take those props
  optionally; the screen simply passes none.
- **The draft is the inspector's truth until saved.** `dirty` is computed
  against the role as the gateway last returned it, so a successful save clears
  it by the refetch alone and a refusal leaves the edits on screen to retry.
  Saving is two calls — `PUT …/permissions`, then `PATCH …` for the title —
  because the gateway has no single "update role"; only what changed is sent.

Routes: `/login`; `/console/{users,roles,content,access,audit,metrics}` under
`ConsoleShell` — Metrics alone carries a search param, `?range=`, validated by
the route; `/` (`homeRoute` in `app/router/catalog-routes.tsx`, component
`HomeRoute`), `/territories`, `/territories/new`, `/territories/$slug`
(search `?jobId=`, validated by the route), `/territories/$slug/replace`,
`/models`, `/models/new`, `/models/$slug`, `/account`, `/account/two-factor`
under the sidebar-free `CatalogShell`; and `/console` alone, which still
resolves a landing screen rather than rendering one — the old
`redirect({ to: "/console" })` on `/` is gone, `"/"` is in `CATALOG_PATHS`,
and sign-in with no `?next=` lands on `/` (`nextTarget`'s `FALLBACK`). Both
shells run the same click delegate (`routesInApp`), so a link from a console
screen into the catalog — or back — stays in the SPA. `isCatalogHref` matches the
seven `CATALOG_PATHS` exactly — Home plus the six list/upload/account paths —
plus `/models/<slug>`, `/territories/<slug>`
and `/territories/<slug>/replace` by pattern. `/territories/<slug>` is the
conversion page now; a ready territory's viewer is still the old SPA, and
only that page leaves for it, through `leaveTo`, on a finish it watched or on
its own button. `consoleLanding` picks that screen from the principal's
permissions — never a constant, or a roles-only administrator is sent to a
users page that 403s.

The console's only doorway into this pair is the identity block at the foot
of `ConsoleSidebar` (the avatar + username link,
`aria-label="Account settings for {username}"`), which opens `/account`; the
wizard is one step further, reached only from the Enable/Regenerate actions
on that page, never linked directly. A principal with no console screen at
all — a Viewer holds only `territory:read` and its siblings, and the sidebar
never renders for it — gets in through the link on `NoConsoleAccess` instead.

**Every mutation on `/account` invalidates what another surface reads, and the
journal is invalidated on both paths.** All three mutations in `use-account`
— the password change, the 2FA disable, the passkey removal — hang
`afterJournalledChange` off **`onSettled`**, never `onSuccess`: the gateway
journals refusals as well (`authhttp/audit.go` writes `result="failed"`, and
`summaryOf` prints it), so a refused change is an event the feed three
sections lower would otherwise be missing. The password change is journalled
as `auth.password_change` and is the one that omitted the key until
2026-09-07. `["audit","mine"]` is named in exactly one place for that reason;
add a mutation here and give it `onSettled: afterJournalledChange` rather
than repeating the key. On top of that: disabling 2FA invalidates
`["two-factor"]` and `["me"]`; adding or removing a passkey invalidates
`["passkeys"]`. `["me"]` is the load-bearing one: `me.totpEnabled` is
what decides which factor a passkey removal asks for (a code or a password),
and a stale value asks for the wrong one — exactly the bug the old screen
shipped.

**The activity feed answers three states, not two.** `activity` is
`AuditEntry[] | null` and null is "we could not find out", exactly like
`twoFactor` and `passkeys` beside it — every Guest lacks `audit:read_own`
(auth-service migration `00013`) and takes a 403 here, and rendering that as
an empty list told the reader nothing had ever happened under their own
account. `unanswered`, not `isError`: a failed cursor page must leave the
pages already on screen alone — the section reads `stalled` and keeps its
pager. A row's second line is `summaryOf`, which is
**empty for most rows** — every `auth.*` entry the gateway writes carries
entity `session` with an empty `entityId`, `entityLabel` and
`territorySlug`, so the line is dropped rather than filled with a table
name. Take fixture rows from a live `GET /api/audit/mine`, not from
imagination: the invented `entityLabel: "YubiKey 5C"` on a passkey row hid
that defect through nine reviews.

**The activity feed pages by six, over the one cursor query the feed already
holds.** `pages/account/model/paging.ts` is the pure page arithmetic —
`PAGE_SIZE = 6`, `pageCount(total)` (never fewer than one page), `pageSlice`,
`pageSummary` ("1–6 of 184 events", the range form even for a single event),
`rowsNeeded(page)`. `use-account.ts`'s `useAccount` keeps `page` as
component state and derives everything else: `total` is the first page's
`total` (`GET /api/audit/mine`'s `include_total` flag, the one surface that
sets it — `GET /api/audit` is polled and would pay for a `COUNT` on every
tick), `shownPage` clamps `page` to `pageCount(total)` on render so a feed
that shrank under an invalidation lands on its new last page rather than an
empty slice. A page past what is already loaded is not a fresh request —
the gateway only pages forward by cursor — so an effect walks the cursor
pages in between (`rowsNeeded(shownPage) > loaded.length`), one in flight at
a time, until enough rows are in. That walk's predicate is computed once, as
`walking`, and reused by both the effect and `activityBusy`
(`activity.isPending || activity.isFetchingNextPage || walking`): read only
by the query, `busy` would flash "this page could not be loaded" for the one
frame between a chip click and the effect actually firing. The walk itself
stops on `!activity.isFetchNextPageError` — without that guard a refused
cursor page loops (960 requests in 50 ms, measured) because the effect keeps
seeing the rows it still needs and asking again. That flag is query-wide,
so it stops every later walk too, and **the walk resumes on the next click
past the failure**: `onPage(n)` calls `fetchNextPage` itself when
`activity.isFetchNextPageError && rowsNeeded(n) > loaded.length`. Both
clauses earn their place — without the retry every chip past a failure drew
the stalled callout with nothing on the wire behind it until the tab lost
focus, and without `rowsNeeded(n) > loaded.length` a click back onto rows
already in hand asked the gateway for a page nobody needed. `activity-section.tsx`
turns an empty slice into one of three readings via `busy` and `pageCount`:
`waiting` (busy) draws six skeleton lines, not two, so the footer does not
jump ~120px as the walk lands its rows; `stalled` (`!busy && pageCount > 1`)
means the journal holds more than this one page but the walk to it failed —
it draws the warn callout "This page could not be loaded." and **keeps the
footer**, so a chip can get the reader back to a page that did load; `empty`
(`!busy && pageCount <= 1`) is the true zero-row case, the only one with no
footer. The footer's own summary is `pageSummary`; its pager is `Pager` from
`shared/ui/pager`, whose chip layout (first, last two, current ± 1, one gap
between non-neighbours) is `pageList`'s rule, unit-tested against the
mock's own digit sequence.

**The recovery-codes stage is component state, never a URL.** The gateway
issues those codes exactly once, in the body of the call that created or
regenerated them (`enable2FA`/`regenerateRecoveryCodes`), so a link
promising to show them again cannot keep that promise after a reload — there
is nothing left on the server to answer it with. The wizard's `stage` lives
in a plain `useState`, not the route's search.

**The timezone split between `/account`'s feed and `/console/audit` is
deliberate, not a mismatch to fix.** `/account`'s activity feed prints the
reader's local clock (`relativeAt`) because it only ever shows a relative
label — "5 minutes ago" must not read as yesterday because UTC rolled over.
`/console/audit` prints UTC (`formatAt`) because it shows the raw instant,
and grouping by the reader's local date would file an event under a heading
its neighbours in the same UTC day do not share. Each side's comment already
names the other; do not "fix" one to match — that would put a genuine bug in
front of a person comparing two screens for one event.

## Not done yet

**Metrics draws only what Prometheus and the gateway actually serve.** Not
drawn, each for the same one reason — nothing serves it: the SLO budget meter
(no budget anywhere), the per-tile deltas (the panel route takes no offset),
Silence (no Alertmanager route), Copy PromQL (the expressions live in the
gateway's registry and never reach the client), the alert's top contributors
and its "firing for" (no `ALERTS_FOR_STATE` panel). On Audit: no request id on
an entry (the backend does not record one), no ip/user-agent digest, no
`failed:` filter, and the free-text part of the filter is ignored — the
placeholder is all that says so. The backend follow-ups are filed, not built.

**Passkey sign-in is unwired, by decision, not by origin.** `CredentialsForm`
draws the button only when handed `onPasskey`, and `useLogin` does not hand
it one. This used to be because the gateway's `PASSKEY_RP_ORIGINS` was
pinned to `frontend/`'s port 3000 alone, so a ceremony started from 3001
could not succeed — that origin now lists **both** 3000 and 3001, so the
stated reason is gone even though the conclusion still stands: login
passkeys are out of scope for v2 by the spec, not by any remaining
technical block. The "Keep me signed in on this device" checkbox is live:
unticked, `login` and `verifyTwoFactor` send `remember: false` and the
gateway issues a browser-session cookie (spec:
`docs/superpowers/specs/2026-09-03-keep-me-signed-in-design.md`). An action
with no endpoint is not rendered — that rule still hides the passkey button.

**`isPasskeySupported()` is the single gate on the passkey *management*
surface** (`/account`'s Add/Remove, unrelated to the login button above —
that one is unwired outright). One check, not two, because a second one
elsewhere is how the two drift apart; it is `@github/webauthn-json`'s own
`supported()` plus `!window.__DESKTOP__`. The desktop term is not about
capability — the Tauri webview implements WebAuthn — its origin is a
loopback port `PASSKEY_RP_ORIGINS` will never list, so a ceremony started
there fails with
an opaque client-side error and nothing in any server log, the exact failure
`frontend/CLAUDE.md` documents. It is pre-wiring: the desktop shell embeds
`frontend/`, not this SPA, so `__DESKTOP__` is set by no code in v2 today —
no end-to-end test can reach this term from here, only the unit test that
pins it.

`useJobStream` (territory conversion) is the only `EventSource` consumer in
v2, and jsdom has none: `openJobStream` detects a missing `EventSource` and
hands back a no-op closer instead of throwing, so the hook's tests drive it
through a fake rather than exercising the real network path.

`Andrey Viewer Mockup.dc.html` (the 3D viewer and the remaining screens) has no
v2 and has not been ported.
