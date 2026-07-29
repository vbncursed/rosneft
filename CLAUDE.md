# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Before committing Go changes

Run `make -C backend check` — gofmt, `go mod tidy` drift, `GOWORK=off go vet`,
golangci-lint, `go test -race -shuffle=on`, govulncheck. ~80 s. `.githooks/pre-commit`
runs it for you once `make -C backend hooks` has been run in the clone. Rationale for
the two non-obvious steps (`vet` and `tidy-check` both run with the workspace off, and
catch Docker-build failures that `make lint` cannot see): [`backend/CLAUDE.md`](backend/CLAUDE.md#the-commit-gate).

# Frontend is a Vite + React SPA (no Next.js)

The frontend is a client-only single-page app: Vite 8 + React 19, routed with
`@tanstack/react-router` (route tree in `src/routes/`) and served data through
`@tanstack/react-query`. There is no server runtime, no RSC, no App Router.
Entry point is `src/main.tsx`. Check the installed versions in
`frontend/node_modules/@tanstack/*` when an API looks unfamiliar.

**Never write `"use client"`.** It marks a server/client boundary that does not
exist here; every module is already client-side and the bundler ignores it. 62
files carried it as migration residue and were cleaned out — don't reintroduce
it by copying a neighbouring file.

## Commands

All commands run from `frontend/`:

```bash
yarn dev          # Vite dev server (http://localhost:3000, /api proxied to the gateway)
yarn build        # Production build → dist/
yarn preview      # Serve the production build locally
yarn lint         # ESLint (flat config, eslint.config.mjs)
yarn test         # Domain unit tests (node --test, src/**/*.test.ts)
yarn test:spa     # Component/integration tests (vitest, src/**/*.spec.ts[x])
```

## Stack

- **Vite 8 + React 19** SPA. Routing: `@tanstack/react-router` (`src/routes/`). Data: `@tanstack/react-query`. Entry: `src/main.tsx`.
- **TypeScript** strict mode, bundler module resolution. Single path alias `@/*` → `frontend/src/*`.
- **Tailwind CSS 4** via `@tailwindcss/postcss` — uses `@import "tailwindcss"` and `@theme inline` syntax, not v3 `@tailwind` directives
- **ESLint 9** flat config: `@eslint/js` + `typescript-eslint` + `eslint-plugin-react-hooks` + `globals`, plus `max-lines: 200` rule

## Architecture rules (hard)

- **Clean Architecture + DDD**. Every file lives in one of four layers under a bounded context: `domain/`, `application/`, `infrastructure/`, `presentation/`.
- **Hard cap: 200 lines per file** (skipBlankLines, skipComments). Enforced by ESLint. Generated files are exempted explicitly.
- **No speculative abstractions, no dead code, no helpers "just in case"** — only what the current task requires.
- Dependencies point strictly inward: `domain ← application ← presentation`. Domain imports nothing outward; application never imports presentation. Presentation talks to `application/` use cases or an `infrastructure/` gateway that already returns domain entities — never DTO types.
- DTO→domain mapping happens inside gateways; openapi-typescript output is treated as an internal implementation detail.

### Allowed exceptions to layering

- **`territory/` aggregates `placement/` domain types in the SceneBundle response.** `territory-gateway.ts` imports `Placement` and `PlacementAssetOption` from `@/placement/domain` because `SceneBundle` is the server-side aggregate that joins territory + artifact + placements + model options in one call. This is the only sanctioned cross-context domain import; do not extend it to other contexts.

## UI animations

UI animations use the `motion` library (import from `motion/react` — never `framer-motion`). Shared variant/transition presets, a reduced-motion helper, and reusable wrappers (`MotionOverlay`, `MotionModal`, `MotionDrawer`, `MotionList`/`MotionItem`) live in `@/shared/presentation/motion/`; import them from there rather than inlining variants or hand-rolling `AnimatePresence` per component. `motion` is **presentation-only** — never import it in `domain/`, `application/`, or `infrastructure/`. Every animated surface must respect `prefers-reduced-motion` via `useResolvedVariants` (its pure core `resolveVariants` is unit-tested). Keep animated files under the 200-line cap by leaning on the wrappers; extract a sub-section rather than inlining motion mechanics.

## Project layout

```
frontend/
  src/
    main.tsx                            # entry: QueryClientProvider + RouterProvider
    globals.css                         # Tailwind entry + self-hosted fonts
    routes/                             # TanStack Router route tree (client-only)
      router.tsx, root.tsx, layout.tsx  # tree + authed layout guard
      login.tsx, home.tsx, territory-viewer.tsx, territories.tsx, models.tsx,
      model-detail.tsx, *-new.tsx, account.tsx                 # each exports a route
      admin.tsx, admin-users.tsx, admin-roles.tsx, admin-metrics.tsx, ...
      guard.ts                          # redirect-to-login / permission guards
    shared/
      domain/{vec3.ts, lod-artifact.ts, artifact.ts, job.ts}
      infrastructure/
        api/dto.ts                      # openapi-typescript output (autogen, lint-exempt)
        http/{client.ts, http-error.ts, ...}
        query/query-client.ts
        asset-url.ts
      application/{lod-url.ts, toast/{notify.ts, toast-store.ts, toast.ts}}
      presentation/toast/toaster.tsx    # React Toaster; the store lives in application
    territory/                          # bounded context: parent scenes
      domain/{territory.ts, scene-bundle.ts}
      infrastructure/territory-gateway.ts
    model/                              # bounded context: placeable assets
      domain/model.ts
      infrastructure/model-gateway.ts
    upload/                             # bounded context: chunked uploads (tus-style)
      domain/session.ts
      infrastructure/upload-gateway.ts
      application/use-chunked-upload.ts
      presentation/components/{upload-form.tsx, field.tsx, progress-bar.tsx}
    placement/                          # bounded context: scene overlays
      domain/{placement.ts, transform.ts, mutation-state.ts,
              gizmo-mode.ts, asset-option.ts}
      application/use-placements-editor.ts
      infrastructure/placement-gateway.ts
      presentation/
        components/{placements-panel.tsx, placement-row.tsx,
                    placement-form.tsx, create-placement-row.tsx,
                    mode-toggle.tsx, vec3-field.tsx, empty-state.tsx}
        three/{placement-instance.tsx, placements-layer.tsx}
    measurement/                        # bounded context: measure tool
      domain/{measurement.ts, distance.ts, unit-ratio.ts}
      application/use-measurement-tool.ts
      presentation/
        components/measure-button.tsx
        three/{measurement-layer.tsx, measurement-segment.tsx, point-marker.tsx}
    viewer/                             # bounded context: 3D scene composition
      domain/model-metadata.ts
      application/use-keyboard-shortcuts.ts
      presentation/
        components/{model-viewer.tsx, viewer-entry.tsx, viewer-skeleton.tsx,
                    ui-overlay.tsx, model-info-panel.tsx,
                    loading-progress.tsx, reset-camera-button.tsx}
        three/{scene-canvas.tsx, gltf-model.tsx, camera-rig.tsx, lighting.tsx,
               gltf-loader-setup.ts}
    conversion/                         # bounded context: pending conversion screen
      application/{use-conversion-watcher.ts, use-job-stream.ts}
      presentation/conversion-pending.tsx
    panorama/                           # equirect panorama tours + scene markers
    document/                           # PDF overlays anchored to a territory
    auth/                               # login, session marker, RBAC, passkeys, 2FA, admin console
    metrics/                            # owner-only Prometheus dashboard
    audit/                              # bounded context: the change journal
      domain/{audit-entry.ts, diff.ts}  # diff.ts is pure — node --test
      infrastructure/audit-gateway.ts
      application/use-audit-log.ts      # useInfiniteQuery, cursor paging
      presentation/components/          # panel, table, row, filters, diff, export
    onboarding/                         # guided tour
    app-shell/  login/                  # top-level layout + login screen
```

`@/*` resolves to `frontend/src/*`. Route modules in `src/routes/` are client components: they read params/search, call TanStack Query (or a gateway), and render each context's `presentation/`.

## Key conventions

- Tailwind v4 syntax: `@theme inline` block for design tokens, `@import "tailwindcss"` instead of `@tailwind base/components/utilities`
- ESLint flat config (`eslint.config.mjs`), not legacy `.eslintrc`
- Two test runners: pure domain logic → `node --test` (`*.test.ts`); jsdom/React → vitest (`*.spec.ts[x]`). Globs don't overlap.
- Client env is `VITE_API_URL` — **empty in both dev and prod**. nginx serves the SPA and proxies `/api` in production; Vite's dev server proxies `/api` by default in development. Single origin is not a convenience: it is what lets the httpOnly session cookie ride on `<img>`, the pdf.js `<iframe>` and three.js loader requests, none of which can carry an Authorization header. `VITE_DEV_PROXY` overrides the dev target. Dev runs on port **3000** — `PASSKEY_RP_ORIGINS` is pinned to it.

## Territory route composition

`/territories/$slug` is a TanStack Router route. Its loader primes the query
cache with **one** call — `sceneBundleQuery(slug)` — and the component reads it via
`useQuery`; the gateway aggregates territory + LOD0 artifact + placements + model
options + panoramas + documents server-side via errgroup. `toSceneViewModel(bundle)`
maps it into the viewer's props. No client-side fan-out.

Each placement's `glbUrl` is computed by joining `placement.modelSlug` against the `modelOptions[].slug → glbUrl` map (modelOptions already carries the artifact hash). `usePlacementsEditor` receives `modelOptions` and reuses the same lookup for CRUD round-trips, so no per-mutation `getArtifact` is needed.

When the artifact is missing, the route renders `ConversionPending`. If a `?jobId=…` search param is present (set by the upload form's redirect), it subscribes to `/api/jobs/{id}/events` for live SSE updates and refetches on `succeeded`. Without a jobId, it falls back to a short poll — the worker reconciler eventually queues the conversion, and the route re-renders into the viewer once the artifact lands.

`<SceneCanvas>` keeps `<Bounds fit clip observe>` wrapping only the territory GLB so auto-fit ignores placement instances. Each `<PlacementInstance>` clones its GLB scene via `SkeletonUtils.clone` (Three.js disallows the same Object3D under two parents — without the clone, only one of N instances of the same model would render). useGLTF caches by URL so duplicate-model placements share a single network fetch.

Placement transforms: position in scene units (territory's normalized space, max-axis = 2 after `converter.normalize`), rotation Euler XYZ in radians (the form converts to/from degrees for the human input), per-axis scale (default {1,1,1}). Self-placement is structurally impossible (placements FK to two different tables); the backend still rejects non-positive scale.

In-scene gizmo (drei `<TransformControls>`): clicking a placement selects it; the panel and the scene share `selectedId` lifted into `ModelViewer`. Mode is `translate`/`rotate`/`scale`, switchable via the panel toggle or `T`/`R`/`S` keys; `Esc` deselects; clicking empty space (`onPointerMissed`) deselects. The transform is applied imperatively via `useLayoutEffect` on the placement's group ref — keeping React's JSX out of the write path is what lets TransformControls mutate the object during a drag without React re-renders fighting the gizmo. On `dragging-changed → false` we read the object's current pos/rot/scale and dispatch a PUT; OrbitControls is auto-disabled while dragging via the same event. The form re-keys on `placement.updatedAt` so a successful drag refreshes the panel inputs to the new canonical values.

Draco + KTX2 setup lives in `viewer/presentation/three/gltf-loader-setup.ts`. The module-level `useGLTF.setDecoderPath("/draco/")` call wires up the self-hosted Draco decoder (in `frontend/public/draco/`, copied from `node_modules/three/examples/jsm/libs/draco/gltf/`), and the exported `extendGltfLoader(loader)` callback registers a singleton `KTX2Loader` (from `three-stdlib` for drei type-compat) pointing at `frontend/public/basis/`. Every `useGLTF` / `useGLTF.preload` call in `gltf-model.tsx`, `placement-instance.tsx`, and `model-viewer.tsx` passes `extendGltfLoader` so KTX2 textures decode correctly — drei v10 has no global `setKTX2Loader` static method. Without `extendGltfLoader`, KTX2-textured models render as solid-colour primitives. `KTX2Loader.detectSupport(renderer)` is intentionally skipped — module init runs before a renderer exists, so the transcoder falls back to RGBA8 (file-size win preserved, GPU-format VRAM win deferred).

KTX2/Basis Universal textures (`KHR_texture_basisu`) are produced by mesh-service by default (`MESH_KTX2_ENABLED=true`). The frontend MUST register a `KTX2Loader` explicitly — drei does NOT auto-register it, and a missing loader silently renders KTX2-textured models as solid colour. Setup mirrors the Draco one: copy `node_modules/three/examples/jsm/libs/basis/` into `frontend/public/basis/`, then in `model-viewer.tsx`:

```ts
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
const ktx2Loader = new KTX2Loader().setTranscoderPath('/basis/').detectSupport(renderer);
useGLTF.setKTX2Loader(ktx2Loader);
```

LOD generation is on by default with `MESH_LOD_RATIOS=0.5,0.25` — every conversion produces three artifacts: LOD0 (full quality, never simplified), LOD1 (~50% triangles), LOD2 (~25% triangles). Use `getArtifact(slug, lod)` per level or drei `<Detailed>` to switch — placements far from the camera should grab LOD2; the main scene asset should always grab LOD0. Frontends that don't yet request lower LODs continue to use LOD0 only — extra artifacts are harmless.

## Backend gateway endpoints used by the frontend

The gateway exposes a small REST surface defined in `backend/services/gateway-service/api/openapi.yaml`. The frontend talks to it through `openapi-typescript` generated DTOs.

- `GET /api/territories` — list every territory.
- `GET /api/territories/{slug}/scene` — single-shot bundle (territory + LOD0 artifact + placements + model options). Use this instead of four parallel calls.
- `POST /api/territories` — create a territory from `{slug, title, description, sourceBlobHash}`. Response is `{territory, job}`; redirect to `/territories/{slug}?jobId={job.id}` so the conversion-pending screen can subscribe to SSE.
- `GET /api/models` / `POST /api/models` / `GET /api/models/{slug}/artifacts` — same shape as territory, model side.
- `POST /api/uploads` → `PATCH /api/uploads/{id}` (raw bytes + `Upload-Offset` header) → `POST /api/uploads/{id}/finalize` — chunked upload protocol. `useChunkedUpload` slices files into 8 MB chunks and drives the loop; the resulting `blobHash` feeds into create-territory / create-model. Resumable: `HEAD /api/uploads/{id}` reports the current offset so a re-attempted client can pick up where it left off.
- `GET /api/audit` — the change journal, cursor-paged over descending `id` (`nextCursor` in the body, `X-Next-Cursor` on the response). Filters: `actor`, `action`, `entity`, `from`, `to`, `limit` (default 50, capped at 200). Two grants reach it: `audit:read` sees the whole company, `audit:read_own` sees only the caller's own actions — and in that mode the gateway **overwrites** the `actor` parameter rather than merging it, so the pin cannot be widened by hand. Root passes via the owner bypass. **The company scope comes from the session and is not a parameter** — there is no way to ask for another company's history.
- `GET /api/audit.csv` — the same query streamed as CSV. Stays behind `audit:read` alone: it is the whole company's history in one file, which is not what `audit:read_own` opens. Lives on the root router, outside the ETag/compression chain, because ETag hashes the whole body and would buffer the export. The client fetches and blobs it rather than using a plain `<a download>` — not for auth reasons any more (the session cookie rides on a same-origin link too) but because it wants a filename and an error it can surface, and an `<a>` gives neither.
- `GET /api/jobs/{id}/events` — Server-Sent Events for one conversion job. Emits `event: job` whenever the job state changes; closes on `succeeded`/`failed`. Job payload carries `kind` and `slug` so the client knows which entity is being converted.
- **Every route under `/api/territories/{slug}` is gated by `RequireTerritoryAccess`**, a middleware keyed on the route-pattern prefix. A new child resource inherits the gate the moment it is registered — do not add a per-handler scope check instead, that is the shape that failed. It answers 404, never 403: a 403 confirms the territory exists, and to another tenant it must not.
- `GET /api/assets/{hash}` **requires a session and is scoped to the tenant**: `RequireBlobAccess` asks the catalog whether any row this caller can see holds that hash. A blob hash addresses content and is deduplicated across territories and models, so it has no single territory and `RequireTerritoryAccess` cannot cover it. Model blobs pass for everyone — the library is shared by decision. Refusal is 404 (403 would confirm the blob exists); a catalog failure is 503, because that is neither "yours" nor "missing".
- **Added a table with a hash column?** Add a branch to `ResolveBlobAccess` and a case to its integration test, or the new asset type is reachable by nobody or by everybody, and nothing else will notice.
- `GET /api/jobs/{id}/events` **requires a session** but is deliberately not tenant-scoped: a job id is 128 random bits and the payload names a kind and a slug, not a blob.
- **Mutations on a cookie session require `X-CSRF-Token`** (`HMAC(GATEWAY_CSRF_SECRET, sessionToken)`, handed out at login and in `/api/auth/me`). Bearer callers are exempt by construction — a browser cannot attach an `Authorization` header cross-site — so curl, the tests and integrations are unaffected.
- **CORS is off by default.** An empty `GATEWAY_ALLOWED_ORIGINS` means the handler is not mounted at all. Do not "disable" it by blanking the list in code: go-chi/cors reads an empty list as *all* origins.
- All JSON GETs carry strong ETags and answer `If-None-Match` with 304. Browsers cache automatically — no client-side work required.
- All JSON responses are Brotli/gzip-compressed when the client advertises `Accept-Encoding: br, gzip`.

Measure tool (`MeasurementLayer` + `MeasureButton`): toggled by the toolbar button or `M` key. Two clicks on any visible surface (parent GLB or a placement) form one measurement — drei `<Line>` between the points, sphere markers at both ends, and a midpoint `<Html>` label with the distance. While `measureMode` is on the gizmo unmounts and `PlacementInstance` skips its own `stopPropagation` so the click bubbles up to the wrapper-group's `onClick` handler that captures `event.point`. The label converts scene units to source units by `unitRatio = max(metadata.dimensions) / 2` (the converter normalises every mesh to max-axis = 2); when bbox metadata is missing we fall back to raw scene units suffixed `u`. `Esc` exits measure mode, `Clear` wipes finished measurements.
