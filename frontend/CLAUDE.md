# CLAUDE.md — frontend

Guidance for Claude Code working in `frontend/`: the SPA, built against the
Claude Design project **Design System.dc.html**. Until 2026-09-17 it lived in
`frontend-v2/` beside the previous app; once it had taken over every screen,
that app was deleted (commit `3d5ce2d2`) and this one moved into its
directory. Where this file says "the old SPA", it means that deleted app — it
is history, not a place to look. "v2" in a mock's name (`Home v2.dc.html`)
is the design's own versioning.

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

- Stage by path: `git add frontend` — never `git add -A` or `git add .`.
- Check the index before committing: `git diff --cached --name-only`. A
  `git reset --soft` in the other session leaves *its* files staged, and a
  plain `git commit` will sweep them into your commit. This has happened in
  both directions; verify afterwards with
  `git show --stat HEAD | grep -c '^ backend/'` — it must print 0.

`git commit -- frontend` commits only *tracked* changes under that path and
**silently leaves new files behind**. Use `git add frontend && git commit`,
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

**Flipping `material.transparent` at runtime needs `needsUpdate`.** three bakes
`#define OPAQUE` — which hard-sets the fragment alpha to 1.0 — into the program
it compiles while `transparent` is false, and `transparent` is not one of the
properties `setProgram` re-checks per frame. Flip it alone and the material
blends at source alpha 1: the opacity uniform is uploaded and the shader throws
it away. `material.needsUpdate = true` bumps `material.version`, which three
*does* re-check. Do it in a `useLayoutEffect`, ahead of R3F's rAF.

**jsdom 30 has no `HTMLDialogElement.showModal`.** `Modal` and `Drawer` use the
native `<dialog>` on purpose (that is what gives a real browser the focus trap
and the inert background), so `shared/lib/test-setup.ts` carries a small shim.
Do not hand-roll a focus trap to make tests easier. The shim hands focus back
to whatever held it before `showModal()`, as the browser does — and that is
the whole of focus return, because **`Modal` and `Drawer` keep the `<dialog>`
mounted while closed** (`display:none`, children unmounted). They used to
`return null` when closed, which removed the element before `close()` could
run, and every overlay in the app dropped focus on `<body>`.
`shared/ui/modal/use-modal-dialog.ts` closes in a *passive* effect: a
`useLayoutEffect` cleanup keyed on `open` closes before React re-focuses the
button the reader pressed inside the dialog, and focus lands on `<body>`
anyway. A `display` utility on the dialog must be `open:flex`, never `flex` —
an author `display` shows a closed dialog.

**Tailwind 4's `scale-*` and `translate-*` write the `scale` and `translate`
properties, not `transform`.** A `transition-[…,transform]` list therefore
animates no press and no slide at all, and nothing fails. Name `scale` /
`translate` in the list (or use `transition-transform`, which covers all
four). An arbitrary `transition-[…]` with no `duration-*` runs in 0s. Any
`after:*` utility already draws the pseudo-element (`--tw-content` starts as
`""`), so hide it where it must not exist (`last:after:hidden`) rather than
trying to create it only where wanted.

**vitest runs `afterEach` hooks in reverse registration order, so a spec's
own `afterEach` runs *before* the setup file's RTL `cleanup`** — whatever
the test rendered is still mounted. A store reset that emits from there
(`clearNotices` did) is a React update outside `act`, and vitest prints
stderr from a hook only sometimes, so the warning looked like a flake on one
machine while firing in 29 tests on every run. `clearNotices` no longer
emits; a `notify.spec.ts` case guards it. To see hook-time warnings, write
them to a file from a temporary `console.error` shim — the reporter will not
show them. The reporter's "jsdom was created 325 times, try `vmThreads`"
hint is informational: `--pool=vmThreads` cut the suite from 44 s to 11 s but
failed 7 files (times rendered in UTC inside the VM context, and the fetch
mocks in `client.spec`/gateway specs do not cross the realm), so the default
pool stays until that is worth a day.

**`yarn openapi:generate` crashes under `typescript@7.0.2`.**
`openapi-typescript` builds its output through `ts.factory`, which the
TypeScript 7 native port does not expose — its `peerDependencies` say `^5.x`,
so this is not a bug to wait out, the generator never supported 7. The fix is
the scoped `resolutions` entry above (`openapi-typescript/typescript`:
`5.9.3`), which nests a classic compiler for the generator alone and leaves
`tsc -b` on 7.0.2. **Do not "clean up" that entry.** JSON carries no comment,
so a future dependency bump meets an unexplained pin; deleting it fails
nothing today — the build and tests stay green — it only fails the next
person who runs the generator, which may be months later.

**React stays on 19.2.x, pinned with `~`, until `@react-three/fiber` allows
more.** fiber 9.7.0 — the latest stable on 2026-09-17 — declares
`react >=19 <19.3`: it ships its own reconciler build against one React
minor. `^19.2.8` resolved to 19.3.0 in the dependency upgrade and yarn only
warned; the viewer still rendered, which is exactly the kind of green that
hides a reconciler mismatch. `react`, `react-dom`, `@types/react` and
`@types/react-dom` are `~19.2.x`; lift them together with fiber once a fiber
release widens its peer range (`node -e "console.log(require('@react-three/fiber/package.json').peerDependencies.react)"`).

**`resolutions` carries two pins, and both are deliberate.**
`openapi-typescript/typescript: 5.9.3` is the generator's compiler (below).
`openapi-typescript/**/js-yaml: 4.3.2` lifts a dev-only transitive
(`@redocly/openapi-core` pins js-yaml 4.3.1, which has a high-severity
advisory); the `**` is required — yarn 1 ignores a nested `a/b` path when `a`
is not a direct dependency. Drop it once `@redocly/openapi-core` moves on.

**Cosmos and `yarn dev` share `node_modules/.vite/deps`.** Restarting both at
once let Cosmos overwrite the dev server's pre-bundle, and :3000 answered
`504 (Outdated Optimize Dep)` — first the login page, then the viewer chunk.
Restart `yarn dev` again after Cosmos is up; the second restart holds.

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

## Production and the desktop shell

- **Single origin, everywhere.** `VITE_API_URL` is empty in dev
  (`.env.development`) and in production (`.env.production`); nginx serves
  `dist/` and proxies `/api`, the Vite dev server proxies it
  (`VITE_DEV_PROXY` overrides the target), and the desktop shell embeds the
  same `dist/` behind a loopback proxy. This is not a convenience: the
  httpOnly session cookie has to ride on three.js loader requests, the pdf.js
  `<iframe>` and `EventSource`, none of which can carry a header. A build
  without `.env.production` requests `undefined/api/...` and warns about
  nothing — `grep -r undefined/api dist` must find nothing. Both env files
  are tracked with `git add -f` (the root `.gitignore` excludes `.env.*`).
- **Dev runs on port 3000** (`vite.config.ts`), the origin
  `PASSKEY_RP_ORIGINS` lists. Any other origin fails a passkey ceremony
  client-side with no server log.
- **The PWA shell is in `public/`**, carried over from the old SPA: `sw.js`
  (navigations only; offline falls back to `offline.html`, everything else
  goes to the network), `offline.html` (inline styles, no JS, the theme
  tokens copied by hand — bump `CACHE` in `sw.js` when it changes, or
  installed copies keep the old page), `manifest.webmanifest`, `icon.svg`,
  `apple-icon.png`, `og-card.png`, `robots.txt`. `fonts/` came along with
  them and nothing references it. `app/pwa/register-service-worker.ts`
  registers the worker after `load` and swallows a refusal — the desktop
  shell answers `/sw.js` with 404 on purpose (`desktop/src-tauri/src/spa.rs`).
- **The manifest link carries `crossorigin="use-credentials"`**: without the
  cookie, Cloudflare's Bot Fight Mode answers the manifest with 403.
- **Open Graph/Twitter tags are static in `index.html` and cannot be
  per-route** — no unfurler runs JavaScript. Setting them from a route
  changes nothing in any preview. The document `<title>` is one static
  `Andrey Viewer`; no route sets its own.
- **The desktop shell serves three HTML documents from this build** —
  `index.html`, `offline.html` and `pdfjs/web/viewer.html` — and keys its CSP
  on the content type, so all three get a policy. Its rules are in the root
  `CLAUDE.md` ("Desktop shell"); read them before touching anything that
  changes the origin, the cookie or `/sw.js`.

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

**The 200-line file cap is hand-checked here** (skip blank lines and comments),
and it binds product files; several specs are longer and that is accepted.
`.oxlintrc.json` declares only `react/rules-of-hooks` and
`react/only-export-components` — there is no `max-lines` rule (the old SPA
had one). Nothing will tell you when a file crosses the line; count it
yourself when a file starts to feel long.

## Design decisions that keep coming up

**Source of truth.** `Design System.dc.html` defines the components. The screen
mocks (`Users v2`, `Roles v2`, …) are more specific and win for their own
screen. Where they disagree, prefer the screen — but say so.

**Icons do not follow `Design System.dc.html` § Icons (since 2026-09-22).** Every
glyph in `shared/ui/icon` is a runeicons outline (Apache-2.0), the six it lacks
from Lucide (ISC), all on one 24 grid at stroke 1.75 applied by `Icon` — the
glyph files hold shape bodies only. `chevron-down` is in the set. Adding one:
take the runeicons `public/normal/` SVG (Lucide only if runeicons has none),
strip its stroke/fill attributes, add it under a name that says what it means
here, and list it in `shared/ui/icon/NOTICE`. A `+`, `×` or arrow standing alone
as button or indicator content is an `<Icon>`, never a typed character; one
that reads as text (`← Home`, `a × b × c m`, the audit event operators) stays
text. When a drawn plus leaves a bare noun as the visible label (`Model`,
`Upload`), the button's `aria-label` keeps the verb (`New model`,
`Upload territory`). Spec: `docs/superpowers/specs/2026-09-22-runeicons-design.md`.
Do not "restore" an icon to the mock.

**Icon-only controls name themselves with `Tooltip` (`shared/ui/tooltip`), never
`title`.** `Button shape="icon"` does it from its `aria-label` (its `tooltip`
prop takes `{label, shortcut?}` to override, or `false` to opt out; `Menu`'s
`triggerTooltip={false}` does the same for a trigger that shows its own text,
like the account pill) — never wrap
one in another `Tooltip`; a plain icon `<button>` is wrapped in
`<Tooltip label=…>`. A disabled button explains itself through `Tooltip` (its
wrapper span turns `inline-flex` and takes the hover, since a disabled one gets
none; the span is `contents` otherwise, so flipping `disabled` never remounts
the button) and puts the reason in its accessible name too. Tooltips open after
500 ms of mouse hover (instantly within 300 ms of the previous one), at once on
a focus that follows Tab (and matches `:focus-visible`) — never on a focus a
script hands back after Esc/Enter, which a browser rings too — never on touch; Enter/Space on the trigger closes it like a press; Esc closes an open one, and is consumed only when it opened on keyboard focus — a hover-opened one lets the page's own Esc (leaving measure mode) run;
placement is `tooltip-geometry.ts`. Specs drive them with `hoverTip`/`focusTip`
from `shared/ui/tooltip/testing.ts`, which only specs import. Spec:
`docs/superpowers/specs/2026-09-22-tooltip-design.md`.

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

**`--dim` and the light `--muted` are not the mock's values** (design review,
2026-09-16). The mock's `--dim` gave 3.6:1 dark / 3.25:1 light on 9–11 px
mono text, under AA; it is `#81878e` / `#6b6f75` now (>= 4.5:1 on `bg`,
`panel` and `panel-2`), and the light `--muted` darkened to `#55595f` so the
two stay a visible step apart (1.39:1, as in dark). Both are recorded in the
header of `theme.css`. The "carried follow-up" about `text-dim` counts below
is closed by this.

**Motion rules** (design review against Emil Kowalski's craft bar,
2026-09-16; findings and decisions in
`.superpowers/sdd/2026-09-16-frontend-v2-emil-review/`):

- Every pressable answers on pointer-down: `active:scale-[0.97]` (a control),
  `0.95` (a tile or glyph button of 30 px or less), `0.99` (a card), in a
  `transition-[color,background-color,border-color,scale] duration-150
  ease-out` list — with `enabled:` where the element can be disabled.
  `Button` carries it in its base; a hand-rolled button copies the line.
- Nothing keyboard-initiated animates (`M`, `P`, `V`, `T/R/S`, arrows, ⌘K,
  Escape), nor routes, tabs, charts, row selection or a LOD swap.
- Every `<dialog>` enters (200 ms) and leaves (150 ms) through one block in
  `theme.css` — `@starting-style` plus `allow-discrete`; the Drawer slides on
  `--ease-drawer` and its backdrop leaves with it. Menu, DatePicker and
  Dropdown open from their trigger's corner (`origin-top-*`) and leave
  instantly. Reduced motion keeps opacity, drops movement.
- Tokens: `ease-out` is `cubic-bezier(0.23, 1, 0.32, 1)`, `ease-drawer`
  exists, and the default timing of a bare `transition-*` is `ease`.
- Field focus is instant — no `transition-*` on an element with a `focus:`
  border; a progress fill animates `scaleX`, linear; a spinner turns in
  700 ms (2 s under reduced motion, never frozen); a loading `Button` keeps
  its width and does not dim.
- Toasts: success/info leave after 4 s, error/warning stay until dismissed,
  the timer pauses under the pointer and in a hidden tab, and the polite live
  region is always mounted.
- A loading placeholder is `PageSkeleton` in the screen's own shape
  (`console`, `journal`, `catalog`, `form`), shown after 150 ms.
- The console shell stacks below `lg` (the sidebar becomes a strip); the
  scrollbar lane is reserved (`scrollbar-gutter`) on every page but the
  full-bleed viewer, which `CatalogShell layout="viewport"` marks with
  `data-fullbleed`.

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

**A permission chip shows two things at once: granted, and changeable**
(`widgets/permission-matrix`, 2026-09-17). A read-only set — a system role,
a reader without `roles:manage`, a save in flight — still says what it holds:
`held` (accent, filled dot) against `absent` (dim, hollow dot), focusable,
`aria-disabled`, never toggled. On an editable role a permission the actor
cannot grant is `locked` (dashed, warn dot) or, when the role already holds
it, `lockedHeld` (dashed *accent*). The old read-only state drew every chip
the same grey, and a system role's set could not be read at all.

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
mock's `--muted` (`--dim` passes AA since 2026-09-16); the catalogs'
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

## Query cache policy

- **The defaults are `staleTime: 60_000` and `refetchOnWindowFocus: false`**
  (`app/query/query-client.ts`). A mount inside the minute reads the cache and
  asks nothing, so a query is only as fresh as the writes that touch it.
- **A write must invalidate or `setQueryData` everything it changed** — every
  list, detail and bundle holding a copy — or the stale copy is served for a
  minute with nothing behind it to correct it.
- **`cancelQueries` before `setQueryData`.** A refetch already in flight left
  before the write and answers with the old data; landing after the write, it
  puts the old value back. `putUser` (`pages/users/model/put-user.ts`), the
  territory-access save and `mergeInto` (`features/edit-entity`) all await the
  cancel first; their specs hold an in-flight refetch open across the write to
  pin it.
- **`setQueryData` clears `isInvalidated`.** A copy another write had already
  marked stale must be re-marked after the merge, or the merge passes the
  rest of it off as fresh — `mergeInto` in `features/edit-entity` is the
  shape to copy. It bites harder after a `cancelQueries`: the refetch it
  cancels may be the one an invalidation started (a delete's `refresh()`),
  and cancel + write drop that mark together. `putUser` and the
  territory-access save read `isInvalidated` *before* the cancel and, if it
  was set, invalidate again after the write — a screen showing the list
  re-reads it, after the write, so with it.
- **Live routes use `staleTime: 0`**: `jobsQuery` (the route is `no-store`; a
  job started elsewhere must show on mount), the audit journal and its
  24-hour window (`auditQuery`, `auditWindowQuery`), the caller's own feed on
  Home and `/account` (`myAuditQuery`), `consoleSummaryQuery`
  and the metrics `panelsQuery`.
- **The viewer marks, it does not refetch.** Its `onChanged`
  (`use-territory-viewer.ts`) invalidates the scene, the territory and model
  queries and both lists with `refetchType: "none"` — every list on the page
  seeds once and is optimistic afterwards — and removes `["scene", slug]` on
  the way out, since the lists would otherwise reseed from the old bundle on
  the next visit. A ref records the change, not `isInvalidated`, because a
  rename's `setQueryData` clears that flag. A write that lands after the page
  has gone drops the bundle itself — unless a new visit already observes it
  (`getObserversCount() > 0`), where it only stays marked stale: removing it
  would pull the bundle out from under that visit. That visit then *owes* the
  drop (`owed-scene-drop.ts`, per client): it changed nothing itself, but its
  way out drops the bundle anyway, or the next visit seeds from the
  pre-write one.
  Every write the viewer makes goes through it, the tour-link save
  (`useTerritoryLink`) included — the viewer seeds that link from
  `bundle.territory.externalPanoramaUrl`, so a save that only invalidated the
  list left a return visit showing the old link.

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

**Content** is two lists and one `GET /api/jobs` over all of them. Each list
row carries its own `lods` (the LOD summaries the per-row artifacts query used
to fetch — there is no per-row artifacts query any more), and a row's status
is read off its job and those `lods`, so the screen is ready once the three
queries have answered. A conversion is visible while it runs: the row turns
`converting` with the worker's percentage and stage, the inspector draws the
bar and the note, a failure puts the worker's message at the top of the
inspector, and a row whose job just left the live set re-reads the list it
sits in so LODs and size catch up. That effect is one hook,
`useStaleOnFinish` (`entities/conversion`), shared by Content, both catalogs,
Home, Model Detail and the conversion page: a finished territory marks its
list and `["scene", slug]` stale, a finished *model* its list and
`["artifacts", "model", slug]` (Model Detail still reads it); nothing reads a
territory's artifacts, so nothing invalidates them. A query on screen
refetches, one that is not is re-read on its next mount. The conversion page
passes its streamed terminal job as `handled`: the stream already re-read the
bundle, so the poll that follows does not ask again. The kind → list-key map
is its `LIST_KEY`, which Content and `features/edit-entity` reuse.

**The catalogs** (`/territories`, `/models`) share Content's shape — the list,
with `lods` on every row, plus one `GET /api/jobs` — and layer them through
the one shared rule, `conversionStatusOf` in `entities/content`: a failed job
wins outright, a live job reads `converting`, otherwise the `lods` decide
ready/pending. Both call `useStaleOnFinish` (re-read the list),
without which a conversion finishing on screen flips the card backwards to
"pending".
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
size — the old SPA's model page never rendered 3D either, and the mock's
viewer overlays (`ToolRail`, `LodSwitcher`, `StatsStrip`, `ModeChip`,
`KeycapHint` — now built in `shared/ui` for the territory viewer, see below)
are not wired up here yet. `Download GLB` and the
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

**Territory conversion** (`/territories/{slug}`) is two queries plus one
stream: the scene bundle the route already holds (`["scene", slug]` — the
territory and `hasLod0 = sceneReady(bundle)`), `GET /api/jobs`, and — with
`?jobId=` — the job's SSE channel (`openJobStream`/`useJobStream` in
`entities/conversion`). The jobs poll (`jobsPoll`) is off while the stream
delivers a live frame. Replace Source removes `["scene", slug]` before it
navigates here: the replace deletes the old artifacts, and the loader's
`ensureQueryData` would otherwise hand back a cached LOD0 as the result.
The stream, once it has answered, outranks the polled row; when the channel
is lost (the gateway's `event: error` for an unknown or foreign id, or a
dropped connection) the hook forgets its frame so the poll wins again.
**A finish watched on this page opens the viewer in-app, never by reloading
the document.** `shouldOpenViewer(prev, next)`
(`pages/territory-conversion/model/conversion-view.ts`) fires only on
`queued|running → ready` — not for a page that mounts already ready, and not
for `failed → ready` — and `use-territory-conversion.ts` calls `navigate({ to:
territoryPath(slug) })` on it: a router navigation to the bare path (no
`?jobId=`), which is exactly what makes `viewerRoute` re-branch into the
viewer, in place of the old `window.location.assign` this package removed.
The pipeline's
`<ol>` and the failure box are the mock's; the step order is the worker's real
one (`entities/conversion/model/pipeline.ts`), not the mock's: `lod-N` comes
after encoding and compressing and arrives twice, and `registering` only with
`succeeded`. **A failed job may carry no stage and no progress** —
`tenant-a-scene`'s live row is exactly that — so the meta line has a
`stopped before the first report` form and no step is marked; its pipeline is
exactly as blank as a freshly-queued job's, so the two are told apart only by
that meta line and the failure box, never by the steps themselves. Upload
Territory and Replace Source navigate here instead of leaving; `leaveTo`
(`shared/lib/leave.ts`) is gone — the territory viewer's own port retired its
last caller.

**Home** (`/`, `pages/home`) is the landing screen. `useHome` owns three
lists (territories, models, jobs), the jobs poll, and the first page of
`myAuditQuery` sliced to `ACTIVITY_ROWS` (4); the territory cards are the four
most recently updated (`recent(...)` in `home-view.ts`) and read their `lods`
off the list, so no card costs a request of its own. The feed never blocks the
page: `activity` is `null` when unanswered (a Guest's 403), exactly the
tri-state `/account` already reads. `useStaleOnFinish` re-reads each list a
finished job sits in, same as Content and the catalogs.
`useConsoleCounters` reads one call, `GET /api/console/summary`
(`consoleSummaryQuery()`, `staleTime: 0` — the route is `no-store`). It sends
`tzOffset` — minutes east of UTC, `0 - getTimezoneOffset()` so UTC keys as 0,
not -0 — read per call and in the key, so `audit24h` counts the journal's own
local-hour buckets. The gateway
answers only the cards the caller may open and sends **numbers only**; every
sentence on a card (`usersHint`, `rolesHint`, … in `console-hints.ts`) is
worded here, on the frontend. The query is disabled when every card is
locked, and reads `isLoading` rather than `isPending` because a disabled query
stays pending forever (the Roles lesson); a locked or still-loading card reads
`STATIC_HINTS[key]`, and a card the summary nulls or leaves out (its source
failed), or a summary that never answered, reads "count unavailable".
`viewerEmpty`
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
**A territory upload is offered on `territory:create`, never `territory:write`**
(2026-09-17): `POST /api/territories` checks `:create`, no system role holds
it, so only Root (`can`'s owner bypass) creates one. A Company Owner holds
`:write` — it replaces a source and edits, and was walked through a whole
upload to a 403 while the gate read `:write`. Home's grant, the catalog's
`canUpload`, `/territories/new`'s callout and Content's `canCreateTerritory`
(the Territory button — accessible name "New territory" — and the drop target) all read `:create`; Content's
`canManage` and every replace-source gate stay on `:write`.
The header carries `widgets/account-pill` instead: a `Menu` trigger (accessible
name `Account menu for {username}`) with the avatar, username and role title,
fed by `viewerOf(me)`; it opens an identity card over `Account` (router
navigation to `/account` through the page's `onOpen`) and `Sign out`. **`viewerOf`
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
`territoryAdminsQuery` (`GET /api/territory-admins`, every visible
territory's set in one map); visibility is derived (anyone assigned →
`assigned`, nobody → `private`), every grant is `direct`, drafts are kept per
slug so switching territories loses no edit, and Save is one PUT of the whole
set. The PUT answers 204 and replaces the set, so on success the ids just
sent are written into that slug's map entry with `setQueryData` and the draft
dropped in the same tick — no re-read of the map, and no window where the
panel shows the pre-save set.

**Audit** is one infinite query keyed by the parsed filters, plus its own
24-hour window query for the counters above the list — a filter narrows the
journal and never moves them. It follows only while the first page is the only
one: refetching N pages every 30 s is not "live", so paging older stops the
poll, and a hidden tab sends nothing. **Metrics** is one multi-panel request
per tick (`panelsQuery` asks for `ALL_PANELS`, the one list both it and
`useMetrics` read; one cache entry keyed on the range the URL holds —
`?range=`, validated in the route, `1h` by default), polled every 30 s in a
visible tab. The health list is synthesised from the `services-up` panel plus
the RED panels rather than fetched; alerts are summarised from their own
labels. A panel the gateway left out of an answered map failed on its own:
one it answered on an earlier tick of the same range keeps those series,
marked stale ("· stale — last answer kept"), so a transient failure does not
flicker the card dark. Every reader of a kept answer says so in the same
words: the panel card's meta, a headline tile's hint, the health meter's
detail (when any of `services-up`/`red-*` is kept) and the alerts badge
(even at zero); only a panel never answered darkens its card
("unavailable — Prometheus did not answer"). Only a request that failed
outright makes the dashboard unavailable — one dead panel must not blank a
working screen.

Rulings from those screens that a later one will meet again:

- **Reset password is drawn only where the gateway would allow it**
  (`canResetPassword`, `pages/users/model/people.ts`): never on the reader's
  own row (`/account` asks for the old password) or a deleted account (a
  frozen one may be reset), and on a Company Owner's or Root's row only for
  Root. `PUT /api/auth/users/{id}/password` signs the user
  out everywhere; the dialog (`features/reset-password`) opens holding a
  generated password, shown. The gateway also refuses (403) a non-Root reset
  of anyone holding a permission the reader lacks — whoever sets a password
  can sign in as that user. The list rows carry role slugs, not permissions,
  so the button cannot predict that refusal and the toast explains it. The
  mutation runs with `gcTime: 0`: its variables are the password in the clear.
  **A success does not close the dialog** — it holds the only copy of the
  password, so it turns to a done state ("Password changed. The user was
  signed out everywhere."), the field read-only and revealed, `Copy password`
  still there and `Done` the one way out (`resetDone`) — Escape and the
  backdrop do nothing there; closing resets the mutation, so the next reset
  opens on the form. Escape and the backdrop also wait for a reset in flight,
  as Cancel does.
- **Edit details** (`features/edit-entity`, `EditDetailsDialog`) renames a
  model or territory — title and description, never the slug — from Model
  Detail (`model:write`), the territory catalog and the viewer header
  (`territory:write`). It sends only the fields that differ from the saved,
  trimmed values, and writes the answer into every cached copy (the entity,
  its list row, a territory's scene bundle, and a model's title in every
  cached bundle whose picker offers it) instead of refetching — cancelling
  each copy's in-flight refetch first (`mergeInto`). The cancel kills any
  read, a mount's first fetch included, so a key that was fetching is
  invalidated again after the write with the default `refetchType`: a screen
  showing it re-reads (the answer carries the save), one nobody shows is only
  marked. Escape waits
  for a save in flight, as Cancel does; a refusal is a toast and an inline
  alert in the dialog.
- **The role pickers offer `admin` (Company Owner) to Root alone**
  (`assignableRoles`, same file): the gateway answers anyone else's grant of it
  with 403. Both the create-user dialog and the add-role dialog read
  `assignableRoles`; `roles` stays whole because the groups and counts need it.
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
  Saving is one `PATCH /api/auth/roles/{slug}` carrying the title (required —
  an unchanged one is a no-op rename) and `permissionSlugs` only when the set
  changed; the gateway applies both in one transaction with the same grant
  checks, and on success only the roles are refetched.

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
and `/territories/<slug>/replace` by pattern. `/territories/<slug>` is one
route for both faces of a territory: its loader warms `sceneQuery(slug)` and
swallows every failure rather than throwing (a 404 and a 503 each have a
designed screen — "Territory not found" and "Territory unavailable: {message}"
— owned by whichever of the two screens below renders, not by the router's
global panels; this amends spec §1, which had the loader 404 through
`notFound()`). `viewerRoute(data, jobId)` (`app/router/guard.ts`) then picks
the screen: the viewer when the bundle has a LOD0 artifact **and** no
`?jobId=` is present, the conversion page otherwise. The upload and replace
flows redirect here with the job they just created (`?jobId=`), so the
conversion page opens its SSE channel at once; when a conversion it is
watching reaches `succeeded`, `shouldOpenViewer`
(`pages/territory-conversion/model/conversion-view.ts`) fires a router
navigation to the bare path (no `?jobId=`) rather than a document load, and
`viewerRoute` re-branches into the viewer on the next render. `consoleLanding` picks that screen from the principal's
permissions — never a constant, or a roles-only administrator is sent to a
users page that 403s.

The console's only doorway into this pair is the identity block at the foot
of `ConsoleSidebar` (the avatar + username link,
`aria-label="Account settings for {username}"`), which opens `/account`; the
wizard is one step further, reached only from the Enable/Regenerate actions
on that page, never linked directly. A principal with no console screen at
all — a Viewer holds only `territory:read` and its siblings, and the sidebar
never renders for it — gets in through the link on `NoConsoleAccess` instead.

**Sign out** (2026-09-22) is `features/sign-out`'s `useSignOut()`, called by
two screens: `/account`'s header (`Sign out`, a secondary `sm` button beside
the theme control, spinning and disabled while one runs) and Home's account
menu. It calls `logout()` — `POST /api/auth/logout`, which revokes the session
and clears the cookie (the desktop proxy drops its jar and keychain entry on
that 204); `logout` swallows a network error and always drops the
`andrey.authed` marker and the CSRF token — then navigates to `/login`, then
`queryClient.clear()`s every cached query so nothing of this user can flash in
front of the next one. **Navigate before clearing, not after**: a clear while
the catalog shell is still mounted leaves its `meQuery` observer with no data,
it refetches, the gateway answers 401 and `client.ts`'s bounce hard-reloads
the tab to `/login?next=%2Flogin` (seen live; the hook's spec pins the order).
A second call while one runs does nothing. Pages stay props-only — the
screens (`HomeScreen`, `AccountScreen`) call the hook and pass `onSignOut`
down, so every fixture still renders without a router or a query client.

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

**Passkey sign-in is wired again (2026-09-22, at the user's request).** It was
once left unwired by decision; the user asked for it back. `useLogin` hands
`CredentialsForm` its `onPasskey` only behind `isPasskeySupported()`, so the
desktop shell (whose loopback origin `PASSKEY_RP_ORIGINS` never lists) draws
no button. The ceremony is begin → `@github/webauthn-json` `get()` → finish,
`credentialed` so an unknown key's 401 does not bounce; then the same
`startSession()` (`entities/user`) that password and 2FA sign-in call — one
function so the three cannot drift — and the same navigation to `next`. **A
passkey session is always persistent**: the finish call sends no `remember`,
so "Keep me signed in on this device" governs the password paths only. That
checkbox is live there: unticked, `login` and `verifyTwoFactor` send
`remember: false` and the gateway issues a browser-session cookie (spec:
`docs/superpowers/specs/2026-09-03-keep-me-signed-in-design.md`).

**`isPasskeySupported()` is the single gate on every passkey surface** —
the login button above and `/account`'s Add/Remove alike. One check, not two, because a second one
elsewhere is how the two drift apart; it is `@github/webauthn-json`'s own
`supported()` plus `!window.__DESKTOP__`. The desktop term is not about
capability — the Tauri webview implements WebAuthn — its origin is a
loopback port `PASSKEY_RP_ORIGINS` will never list, so a ceremony started
there fails with
an opaque client-side error and nothing in any server log. **The term is
live**: the desktop shell embeds this SPA and sets `window.__DESKTOP__ = true`
in its init script (`desktop/src-tauri/src/main.rs`, `INIT_SCRIPT`), so
neither the login screen nor `/account` there draws passkey controls. Only
the unit test pins it from this side.

`useJobStream` (territory conversion) is the only `EventSource` consumer
here, and jsdom has none: `openJobStream` detects a missing `EventSource` and
hands back a no-op closer instead of throwing, so the hook's tests drive it
through a fake rather than exercising the real network path.

`Andrey Viewer Mockup.dc.html` is superseded: the territory viewer is built
to `Territory Viewer v2.dc.html` instead (`pages/territory-viewer`, see "The
territory viewer" below), panoramas and documents included (package B).

## The territory viewer

`/territories/{slug}` for a converted territory (`pages/territory-viewer`;
spec `docs/superpowers/specs/2026-09-10-territory-viewer-v2-design.md`).

- **The Canvas is a context boundary**: nothing under
  `widgets/viewer-canvas/three/` reads `can`, the query client or the theme —
  everything crosses as a prop. `readSceneColors`
  (`widgets/viewer-canvas/model/scene-colors.ts`) reads `--panel`/`--line`/
  `--accent` on mount and on theme change (`viewer-canvas.tsx`); the theme is
  a module store behind `useSyncExternalStore`
  (`features/theme-toggle/model/use-theme.ts`) so the canvas hears the
  sidebar's toggle.
- **Three exempt files** — `gltf-loader-setup.ts`, `ktx2-init.tsx`,
  `glb-preloader.tsx` (`widgets/viewer-canvas/three/`, listed in
  `exempt-modules.ts`) — need real WebGL/a Worker. Everything else
  is spec'd with `@react-three/test-renderer` (`TransformControls` mocked as a
  named group, `three/testing.ts`); drei's `Html` does not portal there, so a
  label spec (`point-marker.spec.tsx`) instead runs under react-dom with
  `Html` a passthrough.
- `gltf-loader-setup.ts` uses three's own `KTX2Loader`, cast at
  `setKTX2Loader` — three-stdlib's loader lags the bundled Basis transcoder
  and renders KTX2 white with no error. `public/basis`/`public/draco` are
  copied from the installed `three`. Never import drei's `<Stats>`.
- **LOD** (`features/lod`): coarsest shown first, the target warmed
  off-screen; `useLodDownload` streams the target through `fetch` into a blob
  URL so `lodProgress` shows a real percent. **Never gate that percent on the
  blob url**: the blob is minted only after the reader loop ends, so a gate on
  it silences every chunk and leaves one 100 % flash after the bytes are in —
  with the loading chip, the 2 px progress line and the dimmed rail tiles gone
  with it. Gate on the target being the level `useLodDownload` is fetching
  (`gltf-model.tsx`'s `counting`). A WARM failure (`onWarmFailed`)
  drops the level silently (the old ladder); a SHOWN failure
  (`onShownFailed`) holds `failure` until `retry()` — the error card. `Try
  again` bumps `retryVersion` (re-keys `LodErrorBoundary`'s `resetKey`);
  `Load coarse LOD n instead` sets `targetLod` **and** bumps `retryVersion`,
  because `failure` is cleared by the retry alone and no level is drawn while
  it is held — setting the target on its own changed a number and left the card
  where it was. **A retry clears drei's cached rejection for the failed url
  first** (`useGLTF.clear` for every level in the chain, the blob included):
  drei loads through suspend-react, which keeps a rejected load under its key
  and re-throws it on the next suspend, so remounting the subtree threw the
  cached rejection before a frame was drawn and `Try again` could never
  recover. `useGLTF.clear` also runs after the blob revoke because drei's cache
  evicts nothing; StrictMode double-fetches once per level in dev, harmlessly.
- **Progressive, not distance-based.** The level on screen never depends on
  camera distance — deliberately not drei's `<Detailed>`: a territory is
  normally framed whole, so distance switching would leave it coarse forever,
  and the measure tool's raycast would hit different geometry at different
  zooms. `GlbPreloader` warms only the coarsest level of each chain; do not
  add LOD0 to it — racing it alongside the coarse level puts both on the wire
  at once.
- **Each placement clones its GLB scene** (`SkeletonUtils.clone`,
  `placement-instance.tsx`): three.js allows one parent per `Object3D`, so
  without the clone only one of N instances of a model renders. `useGLTF`
  caches by URL, so duplicates still share one fetch.
- **Placement transforms** are in the territory's normalised scene space
  (the converter scales every mesh to max-axis 2), rotation Euler XYZ in
  radians (the form shows degrees), scale per axis; the backend rejects a
  non-positive scale.
- **A measured distance is scene units × `computeUnitRatio(dims)`**
  (`entities/measurement`), i.e. `max(bbox) / 2`, because the converter
  normalises to max-axis 2. With no usable bbox the ratio is 1 and the label
  reads `u`, not `m`.
- **`FocusOn` frames from the scene wrapper group, not the territory**
  (`three/focus-on.tsx`): drei's `<Bounds>` interposes its own group — a plan
  deviation, found in review.
- **Placements**: `groupByModel` (`entities/placement/model/groups.ts`) →
  rows per model with 1-based instances; `#N` is positional; a batch create
  is one `POST …/placements/batch` (`createPlacements`, one transaction, 1–100
  items; the picker caps N at 99) from `use-placements-editor.ts`, drawn as an
  indeterminate `Placing N objects…`
  (`widgets/model-picker/ui/place-objects-modal.tsx`); each placing action
  carries an `Idempotency-Key` (`crypto.randomUUID()`), reused only when the
  same model × count is placed again after a failure (the retry of a batch
  whose answer was lost gets the stored rows back, not a second copy) and
  dropped on success or a 409; a failure with no HTTP answer or a 5xx (a
  proxy's 502/504 can arrive after the commit) keeps the key and still calls
  `onChanged`, only a 4xx is a refusal; `messageOf` shows a 5xx as its fallback
  sentence, never the server's text; nothing lands until
  everything does, so there is no "k of N" to count and a refusal leaves
  nothing behind; the editor seeds from the bundle once and the
  page remounts it via `use-scene-seeded` (one-shot) so a cold page is not
  empty.
- **Hiding and user groups** (spec `docs/superpowers/specs/2026-09-23-placement-groups-play-thumbs-design.md` §1).
  `hidden` and `groupId` are properties of the placement, shared by every
  reader; the eyes and the groups are `placement:write`, a group's own `Add`
  is `placement:create`. The panel is `groupPlacements(groupByModel(…), groups)`
  — user groups alphabetically, then model rows holding only what no group
  claims — and `#N` stays the *model's* numbering, so moving a placement never
  renames it. A model row's eye covers every placement of that model, grouped
  ones included (G-3); a group has no hidden flag, its eye is the aggregate
  (`eyeState`: visible / hidden / mixed, `aria-pressed` true/false/"mixed").
  Hiding is one bulk `PUT …/placements/hidden` (`use-bulk-writes.ts`, split
  from the editor at the cap); a hidden selection is dropped
  (`use-placement-handlers.ts`, split from `use-page-handlers.ts` at the cap,
  which also holds the group a group's `Add` aims the picker at). The canvas
  skips hidden placements at its two consumers — `PlacementsLayer` through
  `isShownIn`, and `GlbPreloader` — and a hidden row's Focus is disabled.
  Deleting a group ungroups its placements locally (`ungroup`, mirroring
  `ON DELETE SET NULL`; the editor and the groups hook are wired together in
  `use-viewer-placements.ts`). The panel's open-row key is a model slug or
  `group:<id>` (`userGroupKey`).
- **The Selected block is a form whenever a writer has something selected**
  (user request, 2026-09-14 — the mock's state 2 drew a read-only block). The
  label field, the Pos/Rot/Scl cells and Save are live for any selection
  `placement:write` can touch; `usePlacementForm` takes the page's
  `selectedId` (null without the grant, the one state that only reports) and
  derives an implicit `edit` draft from it, so there is no "open the form"
  step and Rename is only a way in. Draft kinds are `new | edit`: `new` is the
  picker's, cancelling one deletes the object it already POSTed; cancelling an
  `edit` resets the fields and calls nothing. Save sends `update` when a cell
  was typed into and `rename` otherwise — an untouched draft must not push its
  opening copy over a gizmo drag that landed meanwhile, which is also why the
  cells show the *live* transform until `touched`. Saving re-seeds the draft
  rather than closing it. The overline reads `Selected · new` /
  `Selected · saving` / plain `Selected`. **The snap row is the gizmo's, not
  the form's**, so it stays on screen under an open and a saving form alike;
  only the cells go read-only mid-PUT, where typing would invite an edit the
  response is about to overwrite.
- **The Overlays panel owns `--overlays-w`** through
  `overlaysWidthClass(collapsed)`; the page applies the same string to the
  viewport container so the LOD switcher (a sibling) reads it. Tailwind v4
  traps: `max-[N]` is exclusive (`max-[1281px]` for the mock's 1280 state);
  `px-`/`py-` are logical, so a `[writing-mode:vertical-rl]` element needs
  them swapped (`collapsed-rail.tsx`'s vertical pill).
- **`CatalogShell layout="viewport"`** is chosen by `isTerritoryPage(pathname)`
  (which subtracts `CATALOG_PATHS`, so `/territories/new` stays a page); the
  conversion page keeps its `max-w-[760px]` column under it.
- **Tour**: `features/onboarding`'s `VIEWER_TOUR_STEPS` is eight A steps; the
  page feeds `tour.step?.tab` to `useOverlaysPanel` so the panel steps find
  their anchors; the dialog is `aria-modal` with a Tab trap;
  `POST /api/auth/me/onboarding/viewer` once when it ends.
- **Recorded deviations** (spec §6, plus those found in execution): no
  `Share`; `uploaded` date only; default LOD 0; groups expand into instances;
  guest sentence "You can look and measure."; h1 at the mock's `h2` size
  (`viewer-header.tsx`); `Placing N × model` is one batch `POST`
  (`use-placements-editor.ts`); binary MB one decimal (`lod-progress.ts`);
  the LOD switcher offset is one formula, `calc(var(--overlays-w) + 28px)`
  (`viewer-overlays.tsx`), and lands 2 px off the mock at two widths; the
  placing line reads `Placing N objects…` with no count
  (`place-objects-modal.tsx`); the Add-objects primary reads a bare `Place`,
  not the mock's `Place N × model`, because the count is in the stepper beside
  it and the model on the card above (user request 2026-09-14); an unconverted
  model's card reads `Not converted yet` rather than the mock's blank, so
  `modelMeta` gives every card a sub line and the grid's tiles match — the fix
  is in the data, never a min-height on the card (user request 2026-09-14);
  the failed conversion eyebrow still reads
  `Converting` (`territory-conversion-page.tsx:48`); Vec3Field cell padding
  is `6/7` at 300, the mock's `6/6` (`vec3-field.tsx`'s `ROW_CELL`).
- **Deviations from the design review (2026-09-16):** the LOD loading line
  stays the viewer's own 2 px rule (filled by `scaleX`), not `ProgressBar
  thin`, whose track is 5 px; the Add-objects placing bar *is* `ProgressBar
  thin` (5 px, the mock's 3), run indeterminate because the batch has no
  partial progress to report; the `scrolled · metadata above` strip reads `text-muted` and
  overlays the panel body instead of pushing it; the LOD switcher's arrows
  only move focus (spec B §6.15) and no tile changes size (§6.16); a Vec3
  cell shows three decimals and selects its value on focus, so typing
  replaces it; the canvas `dpr` is `[1, 1.5]` with no `AdaptiveDpr` (it
  never regressed — nothing called `regress()`); the orbit coasts
  (`dampingFactor` 0.08, off under reduced motion) and `stop-coast.ts` kills
  the coast before a reset or a drag; the Overlays panel and rail fade in
  with an 8 px slide, and the LOD switcher and measure bar glide on `right`
  (one absolute element each) while the PDF layer does not move. Play
  (`flight-pose.ts`, `camera-rig.tsx`) flies the camera on its own rAF loop
  — the rise stretches with the turn round to the reader's heading
  (`Flight.rise`, twice `RISE_S` for a half turn; 1.2 s swung a reader
  facing away through 180° in a whip) — and ends on OrbitControls `start` or on `controls.enabled` going false — a
  gizmo or marker drag switches the controls off without a `start`. However
  it ends, the orbit pivots on the view ray's point nearest the territory
  (`landingPivot`): the rise's own target can sit below the ground. A
  territory with no finite, non-zero bounds is refused at once. The page
  lands it on Reset and Focus (`use-page-handlers.ts`) and on a pointer mode
  or a panorama (`use-fly-around.ts`).
- **Loading-state rail tiles are `inert`, as mock state 3 draws them** — dimmed
  and out of the Tab order, except the active tile, Play, and the
  Panoramas/Documents tiles, which never go inert (a flight must stay
  stoppable) (`viewer-view.ts`'s `railTools`). An earlier
  note here recorded them as `idle`; the code and the mock both say `inert`.
- **`WAITING_NOTE` copy caveat** (`territory-conversion-page.tsx`): "opens the
  viewer by itself" is true for a finish watched on that page
  (`shouldOpenViewer`, `conversion-view.ts`).
- **Measurements are saved when a chain ends** (spec
  `docs/superpowers/specs/2026-09-17-persisted-measurements-design.md`). A
  chain belongs to the territory and every reader sees it. It goes to the
  server once it stops being the active chain — closed, `Close measurement
  chain`, Escape, or leaving measure mode — and only with two points or more;
  nothing is sent while it is drawn. Cutting a saved chain is a `PUT` of the
  first surviving part plus a `POST` of the second; removing one is a
  `DELETE`; Clear is one `DELETE` of the collection. **Who:**
  `measurement:create/write/delete` (`Grants.measure*`); without `create` the
  tool still measures, the chain stays local and the chip ends in
  ` · not saved` (`notSaved`, also for a failed save); a saved chain offers
  its close button only with all three grants and never while `saving` (`canRemove`).
  **Which calls** a transition needs is the pure `syncPlan` in
  `entities/measurement`; `useMeasurementSync` (`features/measure`) only runs
  it. **It runs in the tool's dispatcher**, which keeps its own running copy of
  the state and computes `after` with the same reducer — never in the reducer
  or a `setState` updater, which StrictMode runs twice and which would send
  every request twice (the spec proves it by moving the plan into an updater).
  The hook belongs to one territory (the screen keys the body on the slug)
  and seeds the bundle's chains once. **Every call that lands calls
  `onChanged`** — the same scene-bundle invalidation the placement, panorama
  and document hooks use — because a reader who comes back in the SPA gets a
  body seeded from that cache; without it the chains they just drew were
  missing until a reload. A failed save is one toast with `Retry`
  (`notify.error(msg, action)`), and **Retry runs only if that chain is still
  on screen and still `failed`** (`io.read()`): a chain cut again since holds a
  newer edit, and the stale PUT used to overwrite it and then delete its row
  through the orphan branch — which now also asks whether any chain still
  holds the `serverId`. A refused delete puts the chain back (Retry removes it
  again); a 404 counts as done; a refused Clear restores everything and offers
  no Retry, because a repeat must ask again and Clear is on screen; an orphan
  that will not delete is only `console.warn`ed — the reader never saw it.
  Cutting a chain whose create failed saves its parts. The Toaster hands
  focus back to where it came from when a card closes.
  **`clear(keepSaved)`**: the page passes `!measurement:delete`, so a reader's
  Clear takes only their own chains and asks nothing; with the grant and saved
  chains on screen it asks first (`ConfirmDialog`, N = the saved chains). The
  journal names these rows `measurement #id` (`entityName`) — the trigger
  records no label.
  **`Show measurements`** (View tab, its own `Measurements` section — not in
  the mock) hides every chain in the scene, remembered per browser in
  `localStorage["andrey.measurements"]` through `shared/lib/use-stored-switch`
  (the same hook `Show panorama points` uses); measure mode draws the ruler
  regardless (`showMeasurements || mode === "measure"` in `scene-canvas.tsx`)
  and leaves the stored choice alone. Hidden is unmounted, not a hidden
  `Object3D`: the labels are `<Html>` DOM.

### Panoramas and documents

Package B (spec `docs/superpowers/specs/2026-09-14-territory-viewer-v2-package-b-design.md`).
Two overlays over the same scene: equirect captures anchored in it, and PDFs
floated above it.

- **The View tab's Panoramas and Documents lists fold; nothing else there
  does.** The switches, the territory link and the anchor editor stay put —
  only the two lists sit behind their section heads
  (`widgets/view-tab`'s `useSectionFolds`, lifted to the page by
  `use-view-sections.ts`). Folded by default; an opened list is remembered
  per browser in `localStorage` `andrey.view.panoramas` /
  `andrey.view.documents` (absence means folded). The page forces a section
  open — Panoramas while a capture is stood in or edited, both while a tour
  runs — and a forced head is locked: `aria-disabled`, still focusable, no
  hover brightening, and a click writes nothing, so the reader's own choice
  survives. A rail tile and a finished upload `reveal` their section, which
  opens *and* remembers it — an upload must not land in a hidden list. An
  empty list has no fold at all. A folded list keeps its `<ul>`, `hidden` and
  empty, because the head's `aria-controls` must point at an element that
  exists. Its rows unmount, so a folded list costs nothing on a re-render. A
  row's thumbnail is the server-made 256×128 JPEG (`thumbnailBlobHash`,
  content-service `internal/thumbnail`), never the equirect; without one the
  row draws the glyph.
- **The reducer owns where the camera is, not the list hooks.**
  `features/viewer-mode`'s state carries `view` (`{kind:"scene"}` or
  `{kind:"panorama", id}`), `move` (the scene-only sub-mode for dragging
  anchors) and `editingPanoramaId` (the anchor card's target, which survives
  going in and out of the sphere — the operator needs the 3D view to aim the
  camera before pressing `Set from camera`). `P` cycles 3D → each capture →
  3D; `V` toggles move and is gated on `panorama:write`; `Escape` peels move,
  then an open measure chain, then the document window, then the selection,
  the mode and the panorama — in that order. `usePanoramaView` derives
  `active`/`editing` by id against the live list, so a deleted capture closes
  its own card — and `onDelete` walks the reader out of the view first when
  the capture deleted is the one they are standing in. The card closes itself;
  the *camera* does not, and a reducer left in `{kind:"panorama", id}` over a
  3D scene keeps the pill, the lit rail tile, the footer and the missing LOD
  switcher all describing a capture that is gone.
- **The rig re-centres the camera on the anchor every frame, and that is the
  whole trick** (`three/panorama-rig.tsx`). OrbitControls orbits *around* its
  target, so left alone the eye drifts on a small arc and placements swim
  against the photo; snapping it back onto the anchor turns the orbit into a
  pure head rotation — zero translation, zero parallax. Zoom and pan are off
  while inside.
- **The sphere's raycast is a no-op.** It encloses the scene, so every ray
  that misses a placement would hit it and `onPointerMissed` would never fire.
  The instance's `raycast` is replaced after mount and the prototype's put
  back on unmount, so nothing leaks onto the shared `Mesh` prototype.
- **The texture decoder is injected, and that is the one exemption.**
  `createImageBitmap` with `imageOrientation` is the single line jsdom cannot
  run, so `usePanoramaTexture` takes a `TextureDecoder` and the canvas widget
  supplies the real one; only `three/image-bitmap.ts` is exempt
  (`exempt-modules.ts`), and *when* to decode is spec'd in the hook.
- **Nothing under `features/` or `entities/` may import `three`.** The hook
  hands back the decoded `ImageBitmap`; `PanoramaSphere` builds the `Texture`
  from it and owns both — `texture.dispose()` and `bitmap.close()` when the
  capture changes or the sphere unmounts. One `import { Texture } from "three"`
  in that feature cost 380 kB in **`index`**: the viewer page imports the
  feature eagerly, so Vite hoisted three's core out of the lazy
  `viewer-canvas` chunk and every reader of `/`, `/territories`, `/models` and
  `/account` downloaded and parsed it before first paint. The check is one
  command — `VITE_API_URL= yarn build` must print `index` around 720 kB and
  `viewer-canvas` around 1.2 MB, and `grep -c BufferGeometry` over the built
  chunks must find three in the viewer's alone. The equirect is tagged sRGB
  and U-flipped (`repeat.x = -1`, `offset.x = 1`) — three does not tag JPEGs,
  and on the inside of a `BackSide` sphere an untouched one reads mirrored.
- **The territory is hidden while a panorama is on screen** (`scene-canvas.tsx`,
  `<group visible={!activePanorama || panoramaOpacity < 1}>`). The sphere has
  radius 50 and the normalised mesh a max axis of 2, so the camera is inside
  both: with the model drawn, an anchor set on the surface looks out at hills
  and tanks in *front* of the photograph. Hidden, never unmounted — `Bounds`
  fits at mount, the marker drag still projects onto the meshes, and
  calibration (opacity < 1) is the operator lining the photo up against the
  model. This is the old SPA's behaviour and B-1 asks for it; it was missed
  once because the fixture's anchor sits above the whole mesh, where there is
  nothing in front of the camera to notice.
- **Calibration happens from the 3D view, and the camera stays free**
  (user decision, 2026-09-16). The draft travels in `calibrationGhost`, its own
  canvas prop, precisely because `activePanorama` is the field `PanoramaRig`
  mounts on — substituting the draft there teleported the eye onto the anchor
  and took the free camera away, which is what once made the ring undrawable.
  Outside a capture the equirect hangs around the scene as a backdrop, and the
  slider decides how it composites: at exactly 100 % the sphere is opaque
  geometry 50 units out and the terrain wins the depth test (the photo is
  *behind* the model); below 100 % — the default is 50 % — it is
  `transparent`/`depthTest:false`/`renderOrder:1000` and paints last, *over*
  terrain, grid and placements. The wash is the alignment picture. The mesh
  stays visible and raycastable, and the anchors layer is handed the draft
  **alone**: one 12 px `bg-accent-soft` ring with the `anchor · drag to move`
  chip, dragged onto the terrain, editing the draft — so `Save` still commits
  and `Exit` still discards, and `V` cannot reach another anchor's PUT because
  there is no other anchor drawn. That ring ignores `Show panorama points` and
  measure mode (it is the alignment's control, not a marker, and the switch is
  remembered in `localStorage` across sessions), a failed backdrop download
  leaves the calibration block standing (it owns the only Save and Exit), and
  the pencil on another capture's row while inside one walks the reader out
  first — `startEdit` in the viewer-mode reducer, because the rig would
  otherwise stand the eye on the edited anchor under the *other* capture's
  photograph. Inside a capture the rig stands on the draft,
  the ring would project onto the eye and is not drawn, and nudge, yaw and
  `Set default view` are the tools. The texture falls back to the capture being
  aligned when there is no active one — keyed on `active` alone, calibrating
  from the 3D view downloaded no photo and had nothing to ghost.
- **A panorama PUT is a replace, never a patch.** `usePanoramaList.update`
  fills every absent field from the row it holds before sending, because the
  gateway zeroes what the body omits. Three surfaces reach that one call —
  the anchor card's Save, the calibration card's Save, and a marker drag — so
  they cannot disagree. The card re-keys on
  `id:updatedAt:position`, since a calibration save can change only the yaw
  and the three legs alone would leave the boxes showing the angle the server
  has just replaced.
- **Visibility is an allowlist, and a new placement is visible everywhere.**
  `POST /placements` carries every current panorama id
  (`use-placements-editor.ts`), because `isVisibleIn` reads an empty list as
  "in no capture" — an object created with `[]` would be invisible in every
  photo. The `Visible in` block is drawn wherever a writer has a placement
  selected and the territory has captures, the 3D scene included (mock 13 is a
  scene state); unchecking one sends `PUT …/placements/{id}/visibility` with
  the rest. `placement:write` gates it (spec §1) — offered without the grant,
  every click was a refusal and a red toast. Hidden objects stay in the 3D scene; only the panorama marker goes.
- **pdf.js is vendored in `public/pdfjs` and the iframe stays mounted while
  the window is hidden.** `Hide` sets `hidden` on the wrapper rather than
  unmounting, so the reader's page and zoom survive; the pill that stands in
  its place is drawn by the *page*, in the stats strip's own row, so its
  offset follows the strip's real width (`showPill={false}` on the widget).
- **Both upload dialogs are one modal over one hook.** `widgets/upload-modal`
  takes a `kind` and reads every word from its own `copy.ts`;
  `entities/upload`'s `useFileUpload` sniffs the leading bytes (JPEG/PNG
  magic, `%PDF-`) before a byte leaves the tab, streams the chunked protocol,
  and the panorama's `run` then reads the file's own EXIF GPS. Three endings,
  each its own toast: `Panorama placed from GPS`, `Photo location doesn't
  match this territory — set position manually`, `Panorama uploaded — set its
  position manually`. The projection is a real UTM forward transform picked by
  the longitude (`entities/panorama/model/geo-anchor.ts`), matched against the
  artifact's source bbox.
- **Two first-run tours, never both on screen.** The viewer's explains the
  scene; the panorama's (`PANORAMA_TOUR_STEPS`, nine steps) starts the first
  time a reader stands inside a capture, and its editing steps skip
  themselves for a reader without the grants. Each POSTs
  `/api/auth/me/onboarding/{id}` once, on stopping — finishing and skipping
  are the same thing to the server.
- **`Move points` is a text button beside the markers switch** (spec §6.7):
  the mock draws no such control, and the tour's `move-points` step needs an
  anchor. `panorama:write` only, scene only, `aria-pressed`, with `V` as a
  hint rather than part of its name.
- **The floating document layer IS the area the PDF window may live in**, and
  `usePipWindow` measures that layer rather than the browser window. The two
  disagreed, and both halves of the disagreement were bugs: the docked corner
  ignored the Overlays panel (at 1400 wide the panel's edge is 1066 and the
  title bar's first action sat at 1248, under it), and the layer's top was
  44px *above* the screen, so dragging the window up put the whole title bar —
  grip, Expand, Hide, Delete, Exit — out of reach. The layer is
  `absolute left-0 top-0 bottom-11 right-[calc(var(--overlays-w)+28px)]`: the
  viewport container, minus the stats-strip row, minus the open panel
  (`left-0` rather than `inset-x-0` because `right` is set beside it — one
  property, one place). It is mounted whether or not a document is open,
  because the hook docks against it once on mount and a box that does not
  exist cannot be measured. A placed window is only ever *re-clamped* after
  that, never re-docked, through one `ResizeObserver` on the layer — which
  catches the panel folding and the browser resizing with one mechanism, and
  without threading `collapsed` back through three hooks to reach a pip.
- **The layer passes clicks through.** Transparent but opaque to the pointer
  it killed the tool rail, the mode chip, the stats strip and the pill while
  a PDF was open. It carries `pointer-events-none` and `ViewportWindow` takes
  its own back. **`pointer-events` is inherited and the top layer does not
  break the chain**, so `Modal` claims its own too — without that every
  confirm dialog mounted inside the layer was unclickable.
- **No key fires under an open `<dialog>`.** `useKeyboardShortcuts` returns
  early while `dialog[open]` matches anything: Escape on a confirm dialog used
  to cancel the dialog *and* run the escape ladder underneath it, walking the
  reader out of the panorama they were only trying to cancel a delete in.
  `Modal` and `ConfirmDialog` are native dialogs; `ViewportWindow` is a
  `<section role="dialog">` on purpose, so the PDF window keeps its Escape,
  which is what spec §1 gives it.
