# frontend-v2

The redesigned SPA. Vite 8 + React 19 + TypeScript 7, Tailwind 4, laid out
Feature-Sliced. It is built against the Claude Design project
`Design System.dc.html` — that document, not this code, is the source of truth
for tokens, spacing and states.

## Commands

```bash
yarn dev          # Vite dev server on :3001, /api proxied to the gateway
yarn build        # tsc -b && vite build → dist/
yarn preview      # serve the production build
yarn lint         # tsc --noEmit + oxlint
yarn test         # vitest (jsdom) — every *.spec.ts(x)
yarn test:watch   # the same, watching
yarn test:coverage
yarn cosmos       # React Cosmos on :5100 — every *.fixture.tsx
yarn cosmos:export
```

Port 3001, not 3000: `frontend/` keeps 3000 while both apps coexist.

**Use yarn, never npm** — including version lookups (`yarn info <pkg> version`).

## What is here

The design system's components, ported layer by layer, and the first screen
built from them. Routing and data come next — `UsersPage` takes everything
through props and owns no fetching.

Console screens render inside `widgets/console-layout`, which the route
applies. A page renders only its own content: it never draws the navigation
column, and its spec asserts as much.

| Layer | Slices |
| --- | --- |
| `shared/ui` | icon, button, badge, field, text-field, password-field, checkbox, otp-input, quantity-stepper, vec3-field, dropdown, segmented, date-picker, toast, callout, progress-bar, skeleton, sparkline, coverage-meter, modal, drawer, menu, card, section-heading, tabs, avatar, breadcrumbs, catalog-card |
| `entities` | conversion, territory, model, audit, user, metric, placement, permission |
| `features` | measure, snap, onboarding, recovery-codes, theme-toggle, audit-filter, role-assign |
| `widgets` | users-table, permission-matrix, alerts-card, console-nav, console-sidebar, console-layout, page-header, viewer-panel, viewer-toolbar, viewer-skeleton, objects-panel, model-picker, people-groups, event-timeline, record-inspector, person-inspector |
| `pages` | users |

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

`main.tsx`, `cosmos.decorator.tsx` and `shared/lib/test-setup.ts` are exempt as
wiring. `index.ts` barrels are exempt as re-exports.

`yarn test:coverage` enforces 90% statements / lines / functions and 85%
branches over the same set.

## Theme

Tokens live in `src/app/styles/theme.css` as CSS custom properties on `:root`,
re-exported to Tailwind through `@theme inline` (so `bg-panel`, `text-muted`,
`border-line-2` all work). Dark is the design's default; the OS preference
applies on its own and an explicit `data-theme` on `<html>` overrides it in
either direction — `applyTheme()` in `shared/lib/theme.ts` is the only writer.

**Archivo ships no Cyrillic subset.** Territory and model names may be Russian,
so the `--font-sans` stack falls through to Helvetica Neue and then system-ui
for those glyphs. JetBrains Mono does carry Cyrillic.
