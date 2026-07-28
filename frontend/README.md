# Andrey Frontend

Vite + React 19 single-page app for the Andrey 3D platform. Talks to
`gateway-service` over REST (base URL from `VITE_API_URL`, token attached as
`Authorization: Bearer`) and renders converted GLBs with `@react-three/fiber`.

## Commands

```bash
yarn dev               # Vite dev server (http://localhost:5173)
yarn build             # production build → dist/
yarn preview           # serve the production build locally
yarn lint              # ESLint flat config
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
- ESLint 9 flat config: `@eslint/js` + `typescript-eslint` + `eslint-plugin-react-hooks` + `globals`, plus `max-lines: 200`

## Architecture

Clean Architecture + DDD inside `src/`. Each bounded context owns
`domain/` · `application/` · `infrastructure/` · `presentation/` layers.

Contexts: `territory` (parent scenes) · `model` (placeable assets) ·
`placement` (scene overlays) · `panorama` (equirect tours) · `document`
(PDF overlays) · `upload` (chunked uploads) · `measurement` (measure tool) ·
`viewer` (3D scene composition) · `conversion` (pending-conversion screen) ·
`auth` (login, token, RBAC, passkeys, 2FA, admin console) · `metrics`
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
- **infrastructure** — adapters: HTTP transport, openapi DTO→domain mapping, URL builders, token store. Returns domain entities, never DTOs.
- **presentation** — React components and hooks. Imports from `application/` (or an `infrastructure/` gateway that already returns domain entities). Never reaches into DTOs. Dependencies point strictly inward: domain ← application ← presentation.
- **routes** (`src/routes/`) are client components: they read params/search, call TanStack Query, and render presentation. There is no server runtime.

### Hard rules

- **200 lines per file** (skipBlankLines, skipComments). Enforced by ESLint. The autogen `src/shared/infrastructure/api/dto.ts` is the only permanent exemption.
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
valid `Authorization: Bearer <token>` get `401`, and mutating routes
additionally require a per-route permission (`403` otherwise).

The login route (`POST /api/auth/login`, with a `POST /api/auth/login/2fa`
challenge and WebAuthn passkey flow) stores the opaque token via
`auth/infrastructure/token-store`. `client.ts` attaches it as `Authorization:
Bearer` on every gateway request; a `401` clears the token and bounces to
`/login?next=…`. RBAC gates routes through `routes/guard.ts` and the admin
console (users / roles / content / territories / metrics). The full auth
surface is documented in the gateway OpenAPI spec (Swagger at
`http://localhost:8080/docs`).

## Environment

- `VITE_API_URL` — gateway base URL baked into the client bundle at build time.
  Read by `client.ts` (`import.meta.env.VITE_API_URL`) and by the SSE
  `EventSource`. Set it empty for same-origin `/api` requests.
- `VITE_DEV_PROXY` (dev only) — when set, Vite proxies `/api` to that gateway
  URL (e.g. prod) so the SPA runs against real data without touching its CORS.
  Pair with an empty `VITE_API_URL`. See `vite.config.ts`.
