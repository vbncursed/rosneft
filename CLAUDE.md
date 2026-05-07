# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `frontend/node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

## Commands

All commands run from `frontend/`:

```bash
yarn dev          # Start dev server
yarn build        # Production build
yarn start        # Start production server
yarn lint         # ESLint (flat config, eslint.config.mjs)
```

## Stack

- **Next.js 16.2.2** (App Router, `src/app/`) with **React 19**
- **TypeScript** strict mode, bundler module resolution. Single path alias `@/*` → `frontend/src/*`.
- **Tailwind CSS 4** via `@tailwindcss/postcss` — uses `@import "tailwindcss"` and `@theme inline` syntax, not v3 `@tailwind` directives
- **ESLint 9** flat config with `eslint-config-next` (core-web-vitals + typescript) + `max-lines: 200` rule

## Architecture rules (hard)

- **Clean Architecture + DDD**. Every file lives in one of four layers under a bounded context: `domain/`, `application/`, `infrastructure/`, `presentation/`.
- **Hard cap: 200 lines per file** (skipBlankLines, skipComments). Enforced by ESLint. Generated files are exempted explicitly.
- **No speculative abstractions, no dead code, no helpers "just in case"** — only what the current task requires.
- Presentation never imports `infrastructure/` or DTO types — it talks to `application/` use cases or `infrastructure/` gateways that already return domain entities.
- DTO→domain mapping happens inside gateways; openapi-typescript output is treated as an internal implementation detail.

### Allowed exceptions to layering

- **RSC routes (`src/app/**`) may import gateways from `infrastructure/` directly.** Server Components run on the server, where the layer boundary that protects the browser bundle does not apply. The rule "routes import only from `<context>/presentation/`" still holds for any client component a route renders, but the `page.tsx` itself is allowed to call `getSceneBundle`, `listProjects`, etc. directly from `catalog/infrastructure/`. The presentation layer in this codebase is client-only by design.
- **`catalog/` aggregates `placement/` domain types in the SceneBundle response.** `catalog-gateway.ts` imports `Placement` and `PlacementAssetOption` from `@/placement/domain` because `SceneBundle` is the server-side aggregate that joins project + artifact + placements + asset options in one call. This is the only sanctioned cross-context domain import; do not extend it to other contexts.

## Project layout

```
frontend/
  src/
    app/                                # Next.js routing (layout, page, loading)
      layout.tsx
      page.tsx
      projects/[slug]/{page.tsx, loading.tsx}
    shared/
      domain/vec3.ts
      infrastructure/
        api/dto.ts                      # openapi-typescript output (autogen, lint-exempt)
        http/{client.ts, http-error.ts, not-found-on-404.ts}
    catalog/                            # bounded context: projects + artifacts + jobs
      domain/{project.ts, artifact.ts, job.ts, scene-bundle.ts}
      infrastructure/{catalog-gateway.ts, asset-url.ts}
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
```

`@/*` resolves to `frontend/src/*`. Routes import only from `<context>/presentation/` of the contexts they need.

## Key Differences from Common Next.js Patterns

- Next.js 16 may have API changes vs 14/15 — always check `frontend/node_modules/next/dist/docs/` for current API docs
- App Router lives at `src/app/`, not the legacy `app/` at the root
- Tailwind v4 syntax: `@theme inline` block for design tokens, `@import "tailwindcss"` instead of `@tailwind base/components/utilities`
- ESLint uses flat config (`defineConfig` from `"eslint/config"`) not legacy `.eslintrc`

## Project page composition

`/projects/[slug]` is an RSC. It does **one** call — `getSceneBundle(slug)` — and the gateway aggregates project + LOD0 artifact + placements + asset options server-side via errgroup. No second round of `resolveX` helpers on the client; placements and asset options arrive already joined in the bundle.

Each placement's `glbUrl` is computed by joining `placement.assetSlug` against the `assetOptions[].slug → glbUrl` map (assetOptions already carries the artifact hash). `usePlacementsEditor` receives `assetOptions` and reuses the same lookup for CRUD round-trips, so no per-mutation `getArtifact` is needed.

When the artifact is missing, the page renders `ConversionPending`, which posts `/convert`, opens an `EventSource` against `/api/jobs/{id}/events`, and triggers `router.refresh()` once the SSE stream reports `succeeded`. The 4-second `router.refresh` polling loop is gone.

`<SceneCanvas>` keeps `<Bounds fit clip observe>` wrapping only the parent GLB so auto-fit ignores placement instances. Each `<PlacementInstance>` clones its GLB scene via `SkeletonUtils.clone` (Three.js disallows the same Object3D under two parents — without the clone, only one of N instances of the same asset would render). useGLTF caches by URL so duplicate-asset placements share a single network fetch.

Placement transforms: position in scene units (parent's normalized space, max-axis = 2 after `converter.normalize`), rotation Euler XYZ in radians (the form converts to/from degrees for the human input), per-axis scale (default {1,1,1}). Backend rejects `parentSlug == assetSlug` and non-positive scale.

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

- `GET /api/projects?limit=&cursor=` — paginated catalog. Response is still `[]Project`; the gateway returns the `X-Next-Cursor` header until the last page.
- `GET /api/projects/{slug}/scene` — single-shot bundle (project + LOD0 artifact + placements + asset options). Use this instead of four parallel `getProject`/`getArtifact`/`listPlacements`/`listProjects` calls.
- `GET /api/jobs/{id}/events` — Server-Sent Events for one conversion job. Emits `event: job` whenever the job state changes; closes on `succeeded`/`failed`. Replaces 4-second polling.
- All JSON GETs carry strong ETags and answer `If-None-Match` with 304. Browsers cache automatically — no client-side work required.
- All JSON responses are Brotli/gzip-compressed when the client advertises `Accept-Encoding: br, gzip`.

Measure tool (`MeasurementLayer` + `MeasureButton`): toggled by the toolbar button or `M` key. Two clicks on any visible surface (parent GLB or a placement) form one measurement — drei `<Line>` between the points, sphere markers at both ends, and a midpoint `<Html>` label with the distance. While `measureMode` is on the gizmo unmounts and `PlacementInstance` skips its own `stopPropagation` so the click bubbles up to the wrapper-group's `onClick` handler that captures `event.point`. The label converts scene units to source units by `unitRatio = max(metadata.dimensions) / 2` (the converter normalises every mesh to max-axis = 2); when bbox metadata is missing we fall back to raw scene units suffixed `u`. `Esc` exits measure mode, `Clear` wipes finished measurements.
