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

**Archivo ships no Cyrillic subset.** Territory and model names may be Russian,
so those glyphs fall through to the fallback stack. JetBrains Mono does carry
Cyrillic. Still undecided whether to swap the display face.

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

**Every console screen is live.** Each is a container hook in `pages/*/model`
(`useUsers`, `useRoles`, `useContent`, `useTerritoryAccess`, `useAudit`,
`useMetrics`) that owns the queries, the mutations and the UI state, a
`*-screen.tsx` that maps it onto the props-only page and draws the dialogs
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
catch up. **Territory access** is the territories list, the users list and one
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
- **No owner toggle and no role delete** — neither is drawn in the mocks, so
  neither was built. The endpoints do exist (`POST /api/auth/users/{id}/owner`,
  `DELETE /api/auth/roles/{slug}`) and are deliberately left unwired (plan
  ruling 5); this is not the "an action with no endpoint is not drawn" rule.
  A live test role therefore stays where it was created until someone deletes
  it with curl.
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

Routes: `/login`, `/console/{users,roles,content,access,audit,metrics}` —
Metrics alone carries a search param, `?range=`, validated by the route — and
`/` and `/console` alone, both of which resolve a landing screen rather than
rendering one. `consoleLanding` picks that screen from the principal's
permissions — never a constant, or a roles-only administrator is sent to a
users page that 403s.

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

**Passkey sign-in is unwired, deliberately.** `CredentialsForm` draws the
button only when handed `onPasskey`, and `useLogin` does not hand it one: the
gateway's `PASSKEY_RP_ORIGINS` is pinned to `frontend/`'s port 3000, so a
ceremony started from 3001 cannot succeed. The "Keep me signed in on this
device" checkbox is live: unticked, `login` and `verifyTwoFactor` send
`remember: false` and the gateway issues a browser-session cookie (spec:
`docs/superpowers/specs/2026-09-03-keep-me-signed-in-design.md`). An action
with no endpoint is not rendered — that rule still hides the passkey button.

`Andrey Viewer Mockup.dc.html` (the 3D viewer and the remaining screens) has no
v2 and has not been ported.
