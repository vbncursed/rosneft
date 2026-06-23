# Andrey Frontend

Next.js 16 + React 19 viewer for the Andrey 3D platform. Talks to
`gateway-service` over REST (rewritten same-origin in dev via
`next.config.ts`) and renders converted GLBs with `@react-three/fiber`.

## Commands

```bash
yarn dev               # dev server (http://localhost:3000)
yarn build             # production build
yarn start             # serve the production build
yarn lint              # ESLint flat config
yarn openapi:generate  # regenerate src/shared/infrastructure/api/dto.ts from
                       # ../backend/services/gateway-service/api/openapi.yaml
```

> Re-run `yarn openapi:generate` whenever the gateway's `openapi.yaml` changes
> (it now also covers `/api/auth/*`, the asset proxy, and the job SSE stream).

## Stack

- Next.js 16.2.2 (App Router, `src/app/`), React 19, TypeScript strict mode
- Tailwind CSS 4 via `@tailwindcss/postcss` (CSS-first config, `@theme inline`)
- `@react-three/fiber` + `@react-three/drei` (Bounds, OrbitControls, TransformControls, useGLTF, Line, Html), `three`, `three-mesh-bvh`
- ESLint 9 flat config, `eslint-config-next` (core-web-vitals + typescript) + `max-lines: 200`

## Architecture

Clean Architecture + DDD inside `src/`. Each bounded context owns
`domain/` · `application/` · `infrastructure/` · `presentation/` layers.

Contexts: `territory` (parent scenes) · `model` (placeable assets) ·
`placement` (scene overlays) · `panorama` (equirect tours) · `upload`
(chunked uploads) · `measurement` (measure tool) · `viewer` (3D scene
composition) · `conversion` (pending-conversion screen) · `shared`
(cross-context primitives).

```
src/
  app/                                # routes only — RSC pages call into contexts
    layout.tsx, page.tsx              # territories + models grid
    territories/[slug]/{page.tsx, loading.tsx}   # viewer
    territories/new/page.tsx          # upload territory
    models/{page.tsx, new/page.tsx, [slug]/page.tsx}
  shared/
    domain/{vec3.ts, lod-artifact.ts, artifact.ts, job.ts}
    infrastructure/
      api/dto.ts                      # openapi-typescript output (autogen, lint-exempt)
      http/{client.ts, http-error.ts, not-found-on-404.ts}
      asset-url.ts
    application/lod-url.ts
  territory/
    domain/{territory.ts, scene-bundle.ts}
    infrastructure/territory-gateway.ts
  model/
    domain/model.ts
    infrastructure/model-gateway.ts
  upload/
    domain/session.ts
    infrastructure/upload-gateway.ts
    application/use-chunked-upload.ts
    presentation/components/{upload-form, field, progress-bar}.tsx
  placement/
    domain/{placement, transform, mutation-state, gizmo-mode, asset-option}.ts
    application/use-placements-editor.ts
    infrastructure/placement-gateway.ts
    presentation/
      components/{placements-panel, placement-row, placement-form,
                  create-placement-row, mode-toggle, vec3-field, empty-state}.tsx
      three/{placement-instance, placements-layer}.tsx
  panorama/                           # equirect panorama tours + scene markers
  measurement/
    domain/{measurement, distance, unit-ratio}.ts
    application/use-measurement-tool.ts
    presentation/components/measure-button.tsx
    presentation/three/{measurement-layer, measurement-segment, point-marker}.tsx
  viewer/
    domain/model-metadata.ts
    application/use-keyboard-shortcuts.ts
    presentation/
      components/{model-viewer, viewer-entry, viewer-skeleton, ui-overlay,
                  model-info-panel, loading-progress, reset-camera-button}.tsx
      three/{scene-canvas, gltf-model, camera-rig, lighting}.tsx
      three/gltf-loader-setup.ts      # Draco + KTX2 wiring
  conversion/
    application/{use-conversion-watcher, use-job-stream}.ts
    presentation/conversion-pending.tsx
```

### Layer rules

- **domain** — entities and value objects only; no I/O, no React.
- **application** — use cases that orchestrate domain + infrastructure.
- **infrastructure** — adapters: HTTP transport, openapi DTO→domain mapping, URL builders. Returns domain entities, never DTOs.
- **presentation** — React (client) components and hooks. Imports from `application/` (or `infrastructure/` when no orchestration is needed). Never reaches into DTOs or other contexts' infrastructure. RSC `page.tsx` routes may call gateways from `infrastructure/` directly (server-side).

### Hard rules

- **200 lines per file** (skipBlankLines, skipComments). Enforced by ESLint. The autogen `src/shared/infrastructure/api/dto.ts` is the only permanent exemption.
- **No speculative abstractions, no dead code, no helpers "just in case."** Add only what the current task requires.
- Single path alias `@/*` → `frontend/src/*`. No relative `../../..` imports.

See [`CLAUDE.md`](CLAUDE.md) for the full architecture rules and the
Next.js-16-specific notes.

## Territory page composition

`/territories/[slug]` is an RSC. It does **one** call — `getSceneBundle(slug)` —
and the gateway aggregates territory + LOD0 artifact + placements + model
options server-side. Each placement's `glbUrl` is joined client-side against
`modelOptions[].slug → glbUrl`, so CRUD round-trips reuse the same map and
never need a per-mutation `getArtifact`.

When the artifact is missing, the page renders `ConversionPending`, which
subscribes to `EventSource` on `/api/jobs/{id}/events` (when a `?jobId=` is
present) and triggers `router.refresh()` once the SSE stream reports
`succeeded` — otherwise it falls back to a 4-second `router.refresh` poll.

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

## Authentication (integration pending)

The backend `auth-service` is live and the gateway now **authenticates every
`/api/*` route**: requests without a valid `Authorization: Bearer <token>` get
`401`, and mutating routes additionally require a per-route permission (`403`
otherwise). The frontend does **not** yet send a token, so against the current
gateway its `/api/*` calls will be rejected until auth is wired in.

Planned integration (not in this codebase yet): a login screen posting to
`POST /api/auth/login` (→ `{ token }`, or a 2FA challenge → `POST
/api/auth/login/2fa`), storing the opaque session token, and attaching it as
`Authorization: Bearer` on every gateway request (see `client.ts`). The full
auth surface is documented in the gateway OpenAPI spec (Swagger at
`http://localhost:8080/docs`).

## Environment

- `GATEWAY_URL` (server-side) — absolute URL of `gateway-service`. Defaults to
  `http://localhost:8080`. Used by `apiBase()` in
  `src/shared/infrastructure/http/client.ts`.
- `NEXT_PUBLIC_API_URL` — browser-side URL baked into the client bundle
  (EventSource for SSE connects to it directly).
- On the client, same-origin requests are proxied to the gateway (see
  `next.config.ts`).
