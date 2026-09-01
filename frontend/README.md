# Andrey Frontend

Vite + React 19 single-page app for the Andrey 3D platform. Talks to
`gateway-service` over REST on relative `/api` paths — the session is an httpOnly
cookie the browser attaches itself — and renders converted GLBs with
`@react-three/fiber`.

## Commands

```bash
yarn dev               # Vite dev server (http://localhost:3000, /api proxied to the gateway)
yarn build             # production build → dist/
yarn preview           # serve the production build locally
yarn lint              # tsc --noEmit + oxlint
yarn test              # domain unit tests (node --test, src/**/*.test.ts)
yarn test:spa          # component/integration tests (vitest, src/**/*.spec.ts[x])
yarn openapi:generate  # regenerate src/shared/infrastructure/api/dto.ts from
                       # ../backend/services/gateway-service/api/openapi.yaml
```

> Two test runners by design: pure domain logic runs framework-free under
> Node's built-in runner (`*.test.ts`); anything needing jsdom/React runs under
> vitest (`*.spec.ts[x]`). The globs don't overlap.
>
> Re-run `yarn openapi:generate` whenever the gateway's `openapi.yaml` changes.

## Stack

- Vite 8 + React 19, TypeScript strict mode. Entry: `src/main.tsx`.
- Routing: `@tanstack/react-router` (route tree in `src/routes/`).
- Data: `@tanstack/react-query` (query client in `src/shared/infrastructure/query/`).
- Tailwind CSS 4 via `@tailwindcss/postcss` (CSS-first config, `@theme inline`)
- `@react-three/fiber` + `@react-three/drei` (Bounds, OrbitControls, TransformControls, useGLTF, Line, Html), `three`, `three-mesh-bvh`
- oxlint (`.oxlintrc.json`) — see [Linting](#linting) below

## Document head

**Per-route titles.** Every route sets one through TanStack's `head` option and
the `titleMeta()` helper in `shared/presentation/page-title.ts`; `<HeadContent />`
in `routes/root.tsx` renders the tags and React 19 hoists them into `<head>`.
The deepest matched route wins, so a child overrides its layout. Before this,
nothing in the app ever set a title and all 22 routes shared one — three open
territories meant three indistinguishable tabs, history entries and bookmarks.
The wiring is covered by `page-title.spec.tsx`, which fails if `<HeadContent />`
is removed; a broken chain here is silent, not an error.

**Link previews are static, and cannot be otherwise.** The `og:` and `twitter:`
tags live in `index.html` and are identical for every route. No unfurler —
Slack, Telegram, WhatsApp, iMessage, Twitter — runs JavaScript; they read the
served HTML, which for a client-rendered SPA is always the same shell.
Per-route previews would need SSR or prerendering. Do not try to set `og:` tags
from a route's `head`: it will look right in the browser and change nothing in
any preview.

`og:image` must be an absolute URL — a relative path is dropped by most
unfurlers — so it names the production host even in the desktop shell, where
nothing reads these tags.

**robots.txt** (`public/robots.txt`) deliberately says `Allow: /`, not
`Disallow: /`. Deindexing is done by the `X-Robots-Tag: noindex` header nginx
sets on every response, and a crawler only sees that header on a URL it is
allowed to fetch — disallowing the path hides the noindex and leaves a
already-known URL in the index without a description. Cloudflare appends its
own managed block (the AI-crawler blocks) beneath ours; that list lives in the
Cloudflare dashboard, not in this repo. Before the file existed, `/robots.txt`
fell through nginx's SPA fallback and answered 200 with the app's HTML shell.

**Regenerating the preview card** (`public/og-card.png`, 1200x630) after editing
`public/og-card.svg`:

```bash
sips -s format png public/og-card.svg --out public/og-card.png
```

`sips` is macOS-native and preserves the SVG's own dimensions; ImageMagick is
not required.

## Linting

`.oxlintrc.json` is kept as strict JSON with no comments, even though oxlint
accepts them: an editor's JSON validator flags them, and renaming the file to
`.jsonc` would take it off oxlint's default discovery path — the editor
extension would then silently lint with its own defaults instead of these
rules. So the reasoning lives here.

**Why oxlint and not ESLint.** Not a preference. typescript-eslint refuses to
load under TypeScript 7 (`typescript-eslint does not support TS 7.0`, see
typescript-eslint#10940), so the old `eslint.config.mjs` could not run at all
once TS moved to the native port. `yarn lint` also went from ~5.8 s to ~0.6 s.

**The rule set is a mirror, not oxlint's defaults.** A linter swap should
change the engine, not the policy, or a real regression is indistinguishable
from a new opinion. Concretely:

| Setting | Why |
| --- | --- |
| `plugins` listed explicitly | Drops the unicorn plugin oxlint enables by default. Its rules are reasonable, but ESLint never ran them here. |
| `max-lines: 200`, `skipBlankLines`, `skipComments` | The architecture rule, same numbers as before, so no file changes status in the swap. |
| `react/set-state-in-effect`, `react/immutability` off | Carried over verbatim from `eslint.config.mjs`. These React-Compiler-oriented rules flag intentional patterns: setState inside data-fetch/async effects, and imperative mutation of three.js objects (OrbitControls, TransformControls), which are not React state. |
| `react/no-did-update-set-state` off | oxlint's react plugin bundles rules `eslint-plugin-react-hooks` does not have. `lod-error-boundary.tsx` sets state in `componentDidUpdate` on purpose — that is how a failed LOD level drops out of the chain. |
| `typescript/no-unused-vars` with `^_` | A leading underscore marks a parameter that exists only to give a signature its shape. |
| `dto.ts` override | openapi-typescript output; the only permanent `max-lines` exemption. |

`oxlint` does not typecheck, so `yarn lint` runs `tsc --noEmit` first.

## Architecture

Clean Architecture + DDD inside `src/`. Each bounded context owns
`domain/` · `application/` · `infrastructure/` · `presentation/` layers.

Contexts: `territory` (parent scenes) · `model` (placeable assets) ·
`placement` (scene overlays) · `panorama` (equirect tours) · `document`
(PDF overlays) · `upload` (chunked uploads) · `measurement` (measure tool) ·
`viewer` (3D scene composition) · `conversion` (pending-conversion screen) ·
`auth` (login, session marker, RBAC, passkeys, 2FA, admin console) · `metrics`
(owner-only Prometheus dashboard) · `onboarding` (guided tour) · `shared`
(cross-context primitives). `app-shell` and `login` hold the top-level layout
and login screen.

```
src/
  main.tsx                             # app entry: QueryClientProvider + RouterProvider
  globals.css                          # Tailwind entry + self-hosted fonts
  routes/                              # TanStack Router route tree (client-only)
    router.tsx, root.tsx, layout.tsx   # tree + authed layout guard
    login.tsx, home.tsx, territory-viewer.tsx, territories.tsx, models.tsx, ...
    admin.tsx, admin-users.tsx, admin-roles.tsx, admin-metrics.tsx, ...
    guard.ts                           # redirect-to-login / permission guards
  shared/
    domain/{vec3.ts, lod-artifact.ts, artifact.ts, job.ts}
    infrastructure/
      api/dto.ts                       # openapi-typescript output (autogen, lint-exempt)
      http/{client.ts, http-error.ts, ...}
      query/query-client.ts
      asset-url.ts
    application/{lod-url.ts, toast/{notify.ts, toast-store.ts, toast.ts}}
    presentation/toast/toaster.tsx     # the React Toaster; store lives in application
  territory/  model/  placement/  panorama/  document/  upload/
  measurement/  viewer/  conversion/  auth/  metrics/  onboarding/
```

### Layer rules

- **domain** — entities and value objects only; no I/O, no React.
- **application** — use cases / query definitions that orchestrate domain + infrastructure. Also cross-cutting client ports like `toast/notify`.
- **infrastructure** — adapters: HTTP transport, openapi DTO→domain mapping, URL builders, the session marker. Returns domain entities, never DTOs.
- **presentation** — React components and hooks. Imports from `application/` (or an `infrastructure/` gateway that already returns domain entities). Never reaches into DTOs. Dependencies point strictly inward: domain ← application ← presentation.
- **routes** (`src/routes/`) are client components: they read params/search, call TanStack Query, and render presentation. There is no server runtime.

### Hard rules

- **200 lines per file** (skipBlankLines, skipComments). Enforced by oxlint. The autogen `src/shared/infrastructure/api/dto.ts` is the only permanent exemption.
- **No speculative abstractions, no dead code, no helpers "just in case."** Add only what the current task requires.
- Single path alias `@/*` → `frontend/src/*`. No relative `../../..` imports.

See [`CLAUDE.md`](CLAUDE.md) for the full architecture rules and the
Three.js / loader-setup notes.

## Territory route composition

`/territories/$slug` is a TanStack Router route. Its loader primes the query
cache with **one** call — `sceneBundleQuery(slug)` — and the component reads it
via `useQuery`. The gateway aggregates territory + LOD0 artifact + placements +
model options + panoramas + documents server-side, so there's no client-side
fan-out. `toSceneViewModel(bundle)` maps the bundle into the viewer's props;
each placement's `glbUrl` is joined client-side against `modelOptions[].slug →
glbUrl`, so CRUD round-trips reuse the same map and never need a per-mutation
`getArtifact`.

When the artifact is missing, the route renders `ConversionPending`, which
subscribes to `EventSource` on `/api/jobs/{id}/events` (when a `?jobId=` is
present) and refetches once the SSE stream reports `succeeded` — otherwise it
falls back to a short poll.

`<SceneCanvas>` keeps `<Bounds fit clip observe>` wrapping only the territory
GLB so auto-fit ignores placement instances. Each `<PlacementInstance>`
clones its GLB scene via `SkeletonUtils.clone`; useGLTF caches by URL so
duplicate-model placements share a single network fetch.

Transforms: position in scene units (territory's normalised space, max-axis =
2 after `converter.normalize`), rotation Euler XYZ in radians (the form
converts to/from degrees), per-axis scale (default {1,1,1}).

In-scene gizmo (drei `<TransformControls>`): clicking a placement selects it;
mode `translate`/`rotate`/`scale` switches via the panel toggle or `T`/`R`/`S`
keys; `Esc` deselects; clicking empty space deselects. The transform is applied
imperatively via `useLayoutEffect` on the placement's group ref so
TransformControls can mutate the object during a drag without React re-renders
fighting the gizmo. On `dragging-changed → false` the post-drag transform is
committed via PUT; OrbitControls is auto-disabled while dragging.

Measure tool (`MeasurementLayer` + `MeasureButton`): toggled by the toolbar
button or `M` key. Two clicks on any visible surface form one measurement —
drei `<Line>`, sphere markers, and a midpoint `<Html>` distance label.
Distance converts scene units to source units through
`unitRatio = max(metadata.dimensions) / 2`; missing bbox metadata falls back to
raw scene units suffixed `u`.

## Authentication

Fully wired. The gateway authenticates every `/api/*` route: requests without a
session get `401`, and mutating routes additionally require a per-route
permission (`403` otherwise). Everything under `/api/territories/{slug}` is
additionally gated on the caller's tenant and answers `404` for another
company's territory. `/api/assets/{hash}` needs a session **and** is scoped to
the tenant; `/api/jobs/{id}/events` needs a session.

**Mutations carry `X-CSRF-Token`.** The token is handed out at login and in
`/api/auth/me`, and `auth/infrastructure/csrf-token` keeps it in memory only —
never localStorage, never a cookie, both of which outlive the tab. A page reload
therefore starts without one, and `getMe()` is what brings it back before
anything can be mutated. `client.ts` attaches it on mutating methods;
`upload-gateway` does it by hand, its PATCH/DELETE bypassing the shared client.

**The session is an httpOnly cookie (`andrey_session`), not a stored token.**
This code cannot read it and does not try to: the browser attaches it to every
same-origin request on its own, which is exactly what lets `<img>` thumbnails,
the pdf.js `<iframe>` and three.js loader requests authenticate — none of them
can carry an `Authorization` header.

The login route (`POST /api/auth/login`, with a `POST /api/auth/login/2fa`
challenge and WebAuthn passkey flow) therefore stores no secret. All it keeps is
`auth/infrastructure/session-marker` → `andrey.authed=1` in localStorage, a flag
that lets `routes/guard.ts` bounce an anonymous visitor without an awaited round
trip. It is untrusted and may be stale; a `401` from `client.ts` clears it and
redirects to `/login?next=…`. RBAC gates routes through `routes/guard.ts` and the
admin console (users / roles / content / territories / metrics). The full auth
surface is documented in the gateway OpenAPI spec (Swagger at
`http://localhost:8080/docs`).

## Environment

- `VITE_API_URL` — **empty in both dev and prod**, so every request goes out on a
  relative `/api` path. nginx serves the SPA and proxies `/api` in production;
  the Vite dev server does the same. Single origin is what the session cookie
  depends on — a non-empty value here reintroduces cross-origin requests and
  breaks asset, panorama and PDF loading. Read by `client.ts`, `asset-url.ts` and
  the SSE `EventSource`.
- `VITE_DEV_PROXY` (dev only) — overrides the dev proxy target (default
  `http://localhost:8080`), e.g. to run the SPA against prod without touching its
  CORS. See `vite.config.ts`.
- The dev server listens on **3000**, not Vite's 5173: `PASSKEY_RP_ORIGINS` is
  pinned to `http://localhost:3000`, and a mismatched origin fails every WebAuthn
  ceremony with an opaque client-side `SecurityError` and no server log.
