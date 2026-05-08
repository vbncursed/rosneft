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
yarn openapi:generate  # regenerate src/shared/infrastructure/api/dto.ts
```

## Stack

- Next.js 16.2.2 (App Router, `src/app/`), React 19, TypeScript strict mode
- Tailwind CSS 4 via `@tailwindcss/postcss` (CSS-first config, `@theme inline`)
- `@react-three/fiber` + `@react-three/drei` (Bounds, OrbitControls, TransformControls, useGLTF, Line, Html)
- ESLint 9 flat config, `eslint-config-next` (core-web-vitals + typescript) + `max-lines: 200`

## Architecture

Clean Architecture + DDD inside `src/`. Bounded contexts: `catalog`,
`placement`, `viewer`, plus `shared` for cross-context primitives.

```
src/
  app/                                # routes only — RSC pages call into contexts
    layout.tsx, page.tsx
    projects/[slug]/{page.tsx, loading.tsx}
  shared/
    domain/vec3.ts
    infrastructure/
      api/dto.ts                      # openapi-typescript output (autogen, lint-exempt)
      http/{client.ts, http-error.ts, not-found-on-404.ts}
  catalog/
    domain/{project.ts, artifact.ts, job.ts, scene-bundle.ts}
    infrastructure/{catalog-gateway.ts, asset-url.ts}
  placement/
    domain/{placement.ts, transform.ts, mutation-state.ts,
            gizmo-mode.ts, asset-option.ts}
    application/use-placements-editor.ts
    infrastructure/placement-gateway.ts
    presentation/
      components/{placements-panel, placement-row, placement-form,
                  create-placement-row, mode-toggle, vec3-field, empty-state}.tsx
      three/{placement-instance, placements-layer}.tsx
  measurement/
    domain/{measurement.ts, distance.ts, unit-ratio.ts}
    application/use-measurement-tool.ts
    presentation/
      components/measure-button.tsx
      three/{measurement-layer, measurement-segment, point-marker}.tsx
  viewer/
    domain/model-metadata.ts
    application/use-keyboard-shortcuts.ts
    presentation/
      components/{model-viewer, viewer-entry, viewer-skeleton, ui-overlay,
                  model-info-panel, loading-progress, reset-camera-button}.tsx
      three/{scene-canvas, gltf-model, camera-rig, lighting}.tsx
      three/gltf-loader-setup.ts                # Draco + KTX2 wiring
  conversion/
    application/{use-conversion-watcher.ts, use-job-stream.ts}
    presentation/conversion-pending.tsx
```

### Layer rules

- **domain** — entities and value objects only; no I/O, no React.
- **application** — use cases that orchestrate domain + infrastructure.
- **infrastructure** — adapters: HTTP transport, openapi DTO mapping, URL builders. Returns domain entities, never DTOs.
- **presentation** — React components and hooks. Imports from `application/` (or `infrastructure/` when no orchestration is needed). Never reaches into DTOs or other contexts' infrastructure.

### Hard rules

- **200 lines per file** (skipBlankLines, skipComments). Enforced by ESLint. The autogen `src/shared/infrastructure/api/dto.ts` is the only permanent exemption.
- **No speculative abstractions, no dead code, no helpers "just in case."** Add only what the current task requires.
- Single path alias `@/*` → `frontend/src/*`. No relative `../../..` imports.

## Project page composition

`/projects/[slug]` is an RSC. It does **one** call — `getSceneBundle(slug)` —
and the gateway aggregates project + LOD0 artifact + placements + asset
options server-side. Each placement's `glbUrl` is joined client-side
against `assetOptions[].slug → glbUrl`, so CRUD round-trips reuse the same
map and never need a per-mutation `getArtifact`.

When the artifact is missing, the page renders `ConversionPending`, which
posts `/convert`, subscribes to `EventSource` on `/api/jobs/{id}/events`,
and triggers `router.refresh()` once the SSE stream reports `succeeded`.

`<SceneCanvas>` keeps `<Bounds fit clip observe>` wrapping only the parent
GLB so auto-fit ignores placement instances. Each `<PlacementInstance>`
clones its GLB scene via `SkeletonUtils.clone`; useGLTF caches by URL so
duplicate-asset placements share a single network fetch.

Transforms: position in scene units (parent's normalised space, max-axis =
2 after `converter.normalize`), rotation Euler XYZ in radians (the form
converts to/from degrees for the human input), per-axis scale (default
{1,1,1}).

In-scene gizmo (drei `<TransformControls>`): clicking a placement selects
it; mode `translate`/`rotate`/`scale` switches via the panel toggle or
`T`/`R`/`S` keys; `Esc` deselects; clicking empty space deselects. The
transform is applied imperatively via `useLayoutEffect` on the placement's
group ref so TransformControls can mutate the object during a drag without
React re-renders fighting the gizmo. On `dragging-changed → false` the
post-drag transform is committed via PUT; OrbitControls is auto-disabled
while dragging via the same event.

Measure tool (`MeasurementLayer` + `MeasureButton`): toggled by the toolbar
button or `M` key. Two clicks on any visible surface form one measurement
— drei `<Line>` between the points, sphere markers at both ends, and a
midpoint `<Html>` label. Distance converts scene units to source units
through `unitRatio = max(metadata.dimensions) / 2`; when bbox metadata is
missing the label falls back to raw scene units suffixed `u`.

## Environment

- `GATEWAY_URL` (server-side) — absolute URL of `gateway-service`. Defaults
  to `http://localhost:8080`. Used by `apiBase()` in
  `src/shared/infrastructure/http/client.ts`.
- `NEXT_PUBLIC_API_URL` — fallback for the same value.
- On the client, requests hit same-origin and Next.js proxies them to the
  gateway (see `next.config.ts`).
