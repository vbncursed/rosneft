# frontend

The SPA — served in production by nginx and embedded in the desktop shell.
Vite 8 + React 19 + TypeScript 7, Tailwind 4, laid out Feature-Sliced. It was
`frontend-v2/` (the redesign) until 2026-09-17, when it replaced the previous
app and took over its directory. It is built against the Claude Design project
`Design System.dc.html` — that document, not this code, is the source of truth
for tokens, spacing and states.

## Commands

```bash
yarn dev          # Vite dev server on :3000, /api proxied to the gateway
yarn build        # tsc -b && vite build → dist/
yarn preview      # serve the production build
yarn lint         # tsc -b --noEmit + oxlint
yarn test         # vitest (jsdom) — every *.spec.ts(x)
yarn test:watch   # the same, watching
yarn test:coverage
yarn cosmos       # React Cosmos on :5100 — every *.fixture.tsx
yarn cosmos:export
yarn openapi:generate   # regenerate src/shared/api/dto.ts from the gateway's openapi.yaml
```

Port 3000 is not a preference: it is the origin the gateway's
`PASSKEY_RP_ORIGINS` lists for local dev, and a passkey ceremony from any
other origin fails with no server log. `VITE_DEV_PROXY` overrides the `/api`
target (default `http://localhost:8080`).

`VITE_API_URL` is **empty** in dev and in production — `.env.development` and
`.env.production` both pin it, and both are tracked (`git add -f`, the root
`.gitignore` excludes `.env.*`). A build without `.env.production` sends every
request to `undefined/api/...` and warns about nothing; production is
single-origin behind nginx, the desktop shell behind its loopback proxy.

**Use yarn, never npm** — including version lookups (`yarn info <pkg> version`).

## What is here

The design system's components, ported layer by layer, and every screen built
from them, wired against the real gateway: a session marker, an HTTP client
with CSRF and a 401 bounce, a router and its guard.

Routes: `/login`; Home at `/`; the catalog (`/territories`, `/models`, both
upload forms, `/models/{slug}`, `/territories/{slug}/replace`); the territory
viewer or its conversion page at `/territories/{slug}`; `/account` and
`/account/two-factor`; and `/console/{users,roles,content,access,audit,metrics}`.
`/console` alone renders nothing: it resolves a landing screen from the
signed-in principal's permissions (`app/router/guard.ts`) and redirects to it.
`CLAUDE.md` beside this file has the detail.

**Every console screen is live.** Each fetches through a container hook in
`pages/*/model`, renders the page beside its dialogs, and reports every
outcome as a toast — `shared/lib/notify`, whose Toaster
`app/router/console-shell.tsx` mounts around the whole console. Audit is one
infinite query that follows the newest page and stops following once you page
back; Metrics is one request for every panel, keyed on the range the URL
holds (`?range=`, `1h` by default) and polled every 30 s in a visible tab; a
panel missing from one answer keeps its last series, marked stale, and only a
panel never answered is one dark card rather than a blank dashboard. Content
also watches `GET /api/jobs`, polled every five seconds only while a
conversion is live, so a row shows its progress and stage as it converts and
the worker's message when it fails.

Three rulings a reader would otherwise trip on. **Reset password is drawn
only where the gateway would allow it**: never on your own row or a deleted
account, and on a Company Owner's or Root's only for Root. **There is no owner
toggle**: it is not drawn in the mocks, and although the gateway offers the
endpoint it is deliberately left unwired. (Role delete, by contrast, is
wired.) **A role's people count is unknown, not zero, without `users:read`** —
the people list is never requested, so the card reads "— users" and the
distribution meter says "unavailable".

**Passkey sign-in is not wired**, by decision of the spec (passkey
*management* on `/account` is). `CredentialsForm` draws the button only when
handed `onPasskey`, and the login container does not hand it one.

Console screens render inside `widgets/console-layout`, which the route
applies. A page renders only its own content: it never draws the navigation
column, and its spec asserts as much.

| Layer | Slices |
| --- | --- |
| `shared/ui` | icon, button, badge, detail-list, search-field, radio-card, field, text-field, password-field, checkbox, otp-input, quantity-stepper, vec3-field, dropdown, segmented, date-picker, toast, callout, progress-bar, skeleton, sparkline, line-chart, coverage-meter, modal, drawer, menu, card, section-heading, tabs, avatar, breadcrumbs, catalog-card, artifact-row, checklist, collapsed-rail, confirm-dialog, drop-zone, file-card, keycap-hint, lod-switcher, mode-chip, pager, range, stats-strip, switch, tool-rail, viewport-window |
| `entities` | conversion, content, territory, model, audit, user, role, metric, placement, permission, scene, measurement, passkey, upload, panorama, document |
| `features` | measure, onboarding, recovery-codes, theme-toggle, audit-filter, role-assign, create-user, create-role, grant-access, login, viewer-mode, lod, placements-editor, passkey-manage, panorama-view, panorama-upload, document-view, document-upload, territory-link, sign-out |
| `widgets` | users-table, permission-matrix, alerts-card, console-nav, console-sidebar, console-layout, page-header, viewer-canvas, viewer-skeleton, overlays-panel, placements-panel, model-picker, people-groups, event-timeline, record-inspector, person-inspector, role-groups, role-inspector, content-groups, content-inspector, access-groups, access-inspector, service-health, metric-panels, alert-inspector, auth-steps, login-intro, catalog-shell, account-pill, toaster, view-tab, upload-modal, document-window |
| `pages` | users, audit, roles, content, territory-access, metrics, login, home, account, two-factor, territory-catalog, territory-viewer, territory-conversion, replace-source, model-library, model-detail, upload-territory, upload-models |

## `public/` — served as-is

- `basis/`, `draco/` — the KTX2 transcoder and the Draco decoder, copied from
  the installed `three`; `pdfjs/` — the vendored pdf.js viewer.
- `sw.js` — a minimal service worker: it exists so Chrome and Edge offer
  install, and so a navigation with no network lands on `offline.html` (a
  self-contained page — inline styles, no JS). It caches nothing else;
  `/api`, SSE and GLB downloads go straight to the network.
  `app/pwa/register-service-worker.ts` registers it after `load` and ignores
  a refusal — the desktop shell answers `/sw.js` with 404 on purpose.
  Bump `CACHE` in `sw.js` whenever `offline.html` changes.
- `manifest.webmanifest`, `favicon.ico`, `favicon.svg`, `apple-touch-icon.png`,
  `icon-192.png`, `icon-512.png`, `icon-maskable-512.png` — install metadata
  and icons: icon 2e from `Site Icon.dc.html`. Every icon file here and in
  `desktop/src-tauri/icons/` is generated from the three SVG sources in
  `icons/` by `python3 frontend/icons/render.py`; edit a source and rerun it,
  never an output.
- `og-card.png` — the link-preview image, card 1a from `OG Card.dc.html`,
  rendered from `icons/og-card.html` by the same `render.py`. The
  Open Graph tags in `index.html` are static on purpose: no unfurler runs
  JavaScript, so they cannot vary per route.
- `robots.txt` — `Allow` plus nginx's `X-Robots-Tag: noindex`; the file
  explains why it is not `Disallow: /`.
- `fonts/` — IBM Plex woff2 files carried over from the previous app;
  nothing in this SPA references them (its faces come from `@fontsource`).

## Layout — Feature-Sliced Design

```
src/
  app/          # app-wide setup; app/styles/theme.css holds the design tokens
  pages/        # route-level compositions
  widgets/      # self-contained blocks assembled from features + entities
  features/     # user-facing actions
  entities/     # business objects (territory, model, placement, …)
  shared/       # reusable, domain-free
    ui/         # the design system's components
    lib/        # helpers (cx, theme, test-setup)
```

Imports point downward only: `app → pages → widgets → features → entities → shared`.
A slice never imports a sibling in the same layer.

The single alias is `@/*` → `src/*`. Use it for anything outside the current
slice; relative paths stay inside one.

## Per-module contract

**Every module gets its own spec beside it — one file, one spec.** Not "covered
by a neighbour's test": a module with no `*.spec.ts(x)` of its own fails the
build.

```
button/
  button.tsx          # the component
  button.spec.tsx     # vitest + testing-library — behaviour, not markup
  button.fixture.tsx  # React Cosmos — every state the design draws
  index.ts            # the slice's public surface (exempt)
```

Specs assert what a user can observe (roles, labels, values, focus), so a class
rename does not break them. The exception is a variant test that deliberately
checks a token class survived.

Fixtures render inside `src/cosmos.decorator.tsx`, which loads the real
stylesheet — what Cosmos shows is what the app shows.

**The decorator adds no padding, and must not.** A full-screen fixture — a
page, the console shell — has to reach the edges of the frame, and Cosmos
composes decorators rather than letting a nested one replace its parent, so a
gutter set there could not be opted out of. Component fixtures carry their
own `p-6`; page-level ones deliberately do not.

**`lazy` is deliberately `false`.** Cosmos then imports every fixture into one
bundle, so the first load is heavy and every fixture after it is instant —
which is the right trade for browsing the library, where you open one after
another. Turning it on makes the first paint quicker and puts a fetch in
front of each fixture you open; don't switch it without asking.
`watchDirs` is narrowed to `src` (the default is `.`, the whole directory).

If Cosmos ever seems to hang, check nothing is already holding the port —
`lsof -nP -iTCP:5100 -sTCP:LISTEN`. Killing the `yarn cosmos` wrapper leaves
the child alive; `pkill -f 'node_modules/.bin/cosmos'` is what actually stops
it.

### The rules are enforced, not remembered

`src/fixtures.spec.tsx` renders every fixture. Cosmos loads one only when
someone opens it, so a broken fixture otherwise sits there silently until a
person clicks it — and fixtures are where undertested sample data lives.

`src/architecture.spec.ts` fails the suite when any of these slips:

- a module under `src/` has no neighbouring `*.spec.ts(x)`
- a `shared/ui` slice has no `*.fixture.tsx`
- an import points outward across layers (`shared` may not reach into `entities`,
  and so on up the chain)
- a `shared/ui` slice reaches past a sibling's `index.ts` into its internals
- a source file sits outside a layer, or loose in a layer root instead of a slice

Wiring is exempt, and the list lives in one place — `exempt-modules.ts` at this
package's root, read by both `architecture.spec.ts` and `vite.config.ts`'s coverage
exclude. Two copies of it drifted once and put untested router files in the
coverage numerator. `index.ts` barrels are exempt as re-exports.

`yarn test:coverage` enforces 90% statements / lines / functions and 85%
branches over the same set.

**Type-checking needs `tsc -b`, not `tsc --noEmit`.** The root `tsconfig.json`
is solution-style — `files: []` plus references — so a bare `tsc --noEmit`
compiles nothing and exits 0 whatever is in `src`. It silently passed a
deliberately broken file until this was found; `-b` walks the references.

## Theme

Tokens live in `src/app/styles/theme.css` as CSS custom properties on `:root`,
re-exported to Tailwind through `@theme inline` (so `bg-panel`, `text-muted`,
`border-line-2` all work). Dark is the design's default; the OS preference
applies on its own and an explicit `data-theme` on `<html>` overrides it in
either direction — `applyTheme()` in `shared/lib/theme.ts` is the only writer.

**Archivo ships no Cyrillic subset.** Territory and model names may be Russian,
so the `--font-sans` stack falls through to Helvetica Neue and then system-ui
for those glyphs. JetBrains Mono does carry Cyrillic.
