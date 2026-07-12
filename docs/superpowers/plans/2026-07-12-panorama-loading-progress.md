# Panorama Loading Progress Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a real 0→100% progress bar on a black screen while a panorama's equirect image downloads, then swap to the sphere — replacing the current empty-screen gap.

**Architecture:** Replace `useLoader(TextureLoader, …)` (loads via `<img>`, emits no byte progress) with a streaming `fetch()` that reads the `ReadableStream` and computes progress from `Content-Length`. A pure `readWithProgress` helper does the streaming; a `usePanoramaTexture` hook wraps it to produce a `THREE.Texture` + progress state; `panorama-scene-layer` renders a centered progress bar while loading and the sphere when ready. All changes stay inside the `panorama/` bounded context.

**Tech Stack:** Next.js 16 / React 19, TypeScript strict, `three` + `@react-three/fiber` + `@react-three/drei`, Tailwind v4. Tests via Node's built-in runner (`node --test`).

## Global Constraints

- **200-line hard cap per file** (ESLint `max-lines`, skipBlankLines + skipComments). Every new/modified file must stay under it.
- **Layer boundaries:** presentation talks to `application/` hooks and `domain/`; do NOT import across bounded contexts' presentation. The progress bar is copied into `panorama/`, not imported from `viewer/`.
- **Displayed copy must not contain "Rosneft"/"Роснефть".** UI strings here are neutral ("Loading panorama"); brand word not used.
- **Tests:** `.test.ts` files, `node:test` + `node:assert/strict`, import siblings with the `.ts` extension (mirror `src/panorama/domain/marker-drag.test.ts`). No test framework, no DOM — keep testable logic pure.
- **Run from `frontend/`.** Commands: `yarn lint`, `yarn build`, `yarn test`.

---

## File Structure

- **Create** `frontend/src/panorama/application/read-with-progress.ts` — pure: drains a `Response` body, reports 0–100 progress (or `null` when no `Content-Length`), returns a `Blob`. No React/three imports → unit-testable under `node --test`.
- **Create** `frontend/src/panorama/application/read-with-progress.test.ts` — tests for the streaming/progress math.
- **Create** `frontend/src/panorama/application/use-panorama-texture.ts` — hook: fetches the equirect via `readWithProgress`, builds a formatted `THREE.Texture`, exposes `{ texture, progress, status }`, aborts/disposes on change/unmount.
- **Create** `frontend/src/panorama/presentation/components/panorama-loading-bar.tsx` — the cyan progress bar (copy of viewer's `LoadingProgress`, panorama-local, supports indeterminate).
- **Modify** `frontend/src/panorama/presentation/three/panorama-sphere.tsx` — accept a ready `texture` prop instead of calling `useLoader`; drop the equirect-format effect (moved into the hook).
- **Modify** `frontend/src/panorama/presentation/three/panorama-scene-layer.tsx` — call the hook; render the loading bar (via drei `<Html fullscreen>`) while loading, the sphere + rig when ready, and route errors to `onPanoramaError`.
- **Delete** `frontend/src/panorama/presentation/components/panorama-error-boundary.tsx` — only the scene layer used it; errors now come through the hook's `status`.

---

### Task 1: `readWithProgress` streaming helper (pure, TDD)

**Files:**
- Create: `frontend/src/panorama/application/read-with-progress.ts`
- Test: `frontend/src/panorama/application/read-with-progress.test.ts`

**Interfaces:**
- Consumes: nothing (pure; uses global `Response`, `ReadableStream`, `Blob`).
- Produces: `readWithProgress(res: Response, onProgress: (p: number | null) => void): Promise<Blob>` — drains `res.body`, calling `onProgress` with an integer 0–100 per chunk when `Content-Length` is present, or once with `null` (indeterminate) when it is absent or the body isn't streamable; resolves to a `Blob` of the full bytes.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/panorama/application/read-with-progress.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readWithProgress } from "./read-with-progress.ts";

function streamResponse(chunks: Uint8Array[], contentLength?: number): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(c);
      controller.close();
    },
  });
  const headers = new Headers();
  if (contentLength !== undefined) headers.set("Content-Length", String(contentLength));
  return new Response(stream, { headers });
}

test("reports monotonic progress ending at 100 when Content-Length is known", async () => {
  const chunks = [new Uint8Array(3), new Uint8Array(2)];
  const seen: (number | null)[] = [];
  const blob = await readWithProgress(streamResponse(chunks, 5), (p) => seen.push(p));

  assert.equal(blob.size, 5);
  assert.deepEqual(seen, [60, 100]);
  for (let i = 1; i < seen.length; i++) {
    assert.ok((seen[i] as number) >= (seen[i - 1] as number), "progress must not decrease");
  }
});

test("reports null (indeterminate) once when Content-Length is missing", async () => {
  const chunks = [new Uint8Array(3), new Uint8Array(2)];
  const seen: (number | null)[] = [];
  const blob = await readWithProgress(streamResponse(chunks), (p) => seen.push(p));

  assert.equal(blob.size, 5);
  assert.deepEqual(seen, [null]);
});

test("caps progress at 100 if the stream overruns Content-Length", async () => {
  const chunks = [new Uint8Array(4), new Uint8Array(4)]; // 8 bytes vs declared 5
  const seen: (number | null)[] = [];
  await readWithProgress(streamResponse(chunks, 5), (p) => seen.push(p));

  assert.ok(seen.every((p) => (p as number) <= 100), "progress never exceeds 100");
  assert.equal(seen.at(-1), 100);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && yarn test`
Expected: FAIL — `Cannot find module './read-with-progress.ts'` (file not created yet).

- [ ] **Step 3: Write the minimal implementation**

Create `frontend/src/panorama/application/read-with-progress.ts`:

```ts
// readWithProgress drains a fetch Response body, reporting download progress
// as it goes. TextureLoader/useLoader load images through an <img> element,
// which emits no byte progress — streaming the body ourselves is the only way
// to surface a real percentage. Progress is 0–100 when Content-Length is
// known, or a single null (indeterminate) when the server didn't send it.
export async function readWithProgress(
  res: Response,
  onProgress: (p: number | null) => void,
): Promise<Blob> {
  const total = Number(res.headers.get("Content-Length"));
  const reader = res.body?.getReader();
  if (!reader || !total) {
    onProgress(null);
    return res.blob();
  }

  const chunks: BlobPart[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    // Cap at 100: a compressed transfer can stream more decoded bytes than
    // the wire Content-Length, which would otherwise push past 100.
    onProgress(Math.min(100, Math.round((loaded / total) * 100)));
  }
  return new Blob(chunks);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && yarn test`
Expected: PASS — all three `read-with-progress` tests green (existing tests still pass).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/panorama/application/read-with-progress.ts frontend/src/panorama/application/read-with-progress.test.ts
git commit -m "feat(panorama): streaming read-with-progress helper"
```

---

### Task 2: `usePanoramaTexture` hook

**Files:**
- Create: `frontend/src/panorama/application/use-panorama-texture.ts`

**Interfaces:**
- Consumes: `readWithProgress` from Task 1; `assetUrl` from `@/shared/infrastructure/asset-url`.
- Produces:
  - `type PanoramaTextureStatus = "idle" | "loading" | "ready" | "error"`
  - `interface PanoramaTextureState { texture: Texture | null; progress: number | null; status: PanoramaTextureStatus }`
  - `usePanoramaTexture(hash: string | null): PanoramaTextureState` — pass `activePanorama?.sourceBlobHash ?? null`. Returns `idle` when hash is null; transitions `loading → ready` (with a formatted `THREE.Texture`) or `loading → error`. Re-runs only when `hash` changes; aborts the in-flight fetch and disposes the previous texture on change/unmount.

- [ ] **Step 1: Write the hook**

Create `frontend/src/panorama/application/use-panorama-texture.ts`:

```ts
import { useEffect, useRef, useState } from "react";
import { RepeatWrapping, SRGBColorSpace, Texture } from "three";
import { assetUrl } from "@/shared/infrastructure/asset-url";
import { readWithProgress } from "@/panorama/application/read-with-progress";

export type PanoramaTextureStatus = "idle" | "loading" | "ready" | "error";

export interface PanoramaTextureState {
  texture: Texture | null;
  // 0–100 while downloading, null when the server sent no Content-Length
  // (bar renders indeterminate), 100 once ready.
  progress: number | null;
  status: PanoramaTextureStatus;
}

// Equirect JPGs encode sRGB but three doesn't tag them, and mapped onto the
// inside of a BackSide sphere they read horizontally mirrored. Fix both: tag
// sRGB, and flip the U axis (repeat.x = -1, offset.x = 1 keeps samples in
// [0,1] while reversing direction). Mirrors the old panorama-sphere logic.
function applyEquirectFormat(texture: Texture): void {
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = RepeatWrapping;
  texture.repeat.x = -1;
  texture.offset.x = 1;
  texture.needsUpdate = true;
}

// usePanoramaTexture streams the equirect via fetch so we can surface real
// download progress. Returns a ready THREE.Texture plus 0–100 progress.
// ponytail: no in-memory cache like useLoader — re-entering a panorama
// refetches, but the asset URL is immutable (content hash) + ETag so the
// browser serves it from disk cache. Add an LRU only if that measurably hurts.
export function usePanoramaTexture(hash: string | null): PanoramaTextureState {
  const [state, setState] = useState<PanoramaTextureState>({
    texture: null,
    progress: null,
    status: "idle",
  });
  const textureRef = useRef<Texture | null>(null);

  useEffect(() => {
    if (!hash) {
      setState({ texture: null, progress: null, status: "idle" });
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    setState({ texture: null, progress: null, status: "loading" });

    (async () => {
      try {
        const res = await fetch(assetUrl(hash), { signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await readWithProgress(res, (p) => {
          if (!cancelled) setState((s) => ({ ...s, progress: p }));
        });
        const bitmap = await createImageBitmap(blob);
        if (cancelled) {
          bitmap.close();
          return;
        }
        const texture = new Texture(bitmap);
        applyEquirectFormat(texture);
        textureRef.current = texture;
        setState({ texture, progress: 100, status: "ready" });
      } catch {
        if (!cancelled) setState({ texture: null, progress: null, status: "error" });
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
      textureRef.current?.dispose();
      textureRef.current = null;
    };
  }, [hash]);

  return state;
}
```

- [ ] **Step 2: Typecheck / lint the new file**

Run: `cd frontend && yarn lint`
Expected: PASS — no errors (no unused vars, no exhaustive-deps warning; `hash` is the only effect dependency).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/panorama/application/use-panorama-texture.ts
git commit -m "feat(panorama): usePanoramaTexture hook with streaming progress"
```

---

### Task 3: `PanoramaLoadingBar` component

**Files:**
- Create: `frontend/src/panorama/presentation/components/panorama-loading-bar.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: default export `PanoramaLoadingBar` (memoized) with props `{ progress: number | null }`. Renders a determinate cyan bar for a number, or an indeterminate pulsing bar for `null`.

- [ ] **Step 1: Write the component**

Create `frontend/src/panorama/presentation/components/panorama-loading-bar.tsx`:

```tsx
import { memo } from "react";

interface PanoramaLoadingBarProps {
  // 0–100, or null for indeterminate (server sent no Content-Length).
  progress: number | null;
}

// Copied from viewer's LoadingProgress rather than imported: cross-context
// presentation imports aren't sanctioned by CLAUDE.md's layering rules, and
// this variant adds an indeterminate state the original doesn't have.
function PanoramaLoadingBarImpl({ progress }: PanoramaLoadingBarProps) {
  const indeterminate = progress === null;
  const normalized = indeterminate ? 0 : Math.max(0, Math.min(100, progress));

  return (
    <div className="rounded-xl border border-white/20 bg-black/45 p-4 shadow-xl backdrop-blur">
      <p className="text-xs uppercase tracking-[0.16em] text-neutral-400">Loading panorama</p>
      <p className="mt-1 text-base font-semibold text-white">
        {indeterminate ? "…" : `${normalized.toFixed(0)}%`}
      </p>
      <div className="mt-3 h-2 w-64 overflow-hidden rounded-full bg-white/15 sm:w-72">
        {indeterminate ? (
          <div className="h-full w-1/3 animate-pulse rounded-full bg-cyan-300" />
        ) : (
          <div
            className="h-full origin-left rounded-full bg-cyan-300 transition-transform duration-200"
            style={{ transform: `scaleX(${normalized / 100})` }}
          />
        )}
      </div>
    </div>
  );
}

export default memo(PanoramaLoadingBarImpl);
```

- [ ] **Step 2: Lint the new file**

Run: `cd frontend && yarn lint`
Expected: PASS — no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/panorama/presentation/components/panorama-loading-bar.tsx
git commit -m "feat(panorama): loading bar component with indeterminate state"
```

---

### Task 4: Wire the hook + bar into the scene, drop `useLoader` and the error boundary

**Files:**
- Modify: `frontend/src/panorama/presentation/three/panorama-sphere.tsx`
- Modify: `frontend/src/panorama/presentation/three/panorama-scene-layer.tsx`
- Delete: `frontend/src/panorama/presentation/components/panorama-error-boundary.tsx`

**Interfaces:**
- Consumes: `usePanoramaTexture` (Task 2), `PanoramaLoadingBar` (Task 3), `Html` from `@react-three/drei`.
- Produces: `PanoramaSphere` now requires a `texture: Texture` prop; `PanoramaSceneLayer`'s external props are unchanged (still `onPanoramaError`, `activePanorama`, etc.), so no caller changes.

- [ ] **Step 1: Confirm the error boundary is unused elsewhere before deleting**

Run: `cd frontend && grep -rn "panorama-error-boundary\|PanoramaErrorBoundary" src`
Expected: only `panorama-scene-layer.tsx` (import + JSX) and the boundary file itself. If any OTHER file appears, STOP and keep the boundary — do not delete; instead only remove it from the scene layer.

- [ ] **Step 2: Replace `panorama-sphere.tsx` to consume a `texture` prop**

Replace the entire contents of `frontend/src/panorama/presentation/three/panorama-sphere.tsx` with:

```tsx
import { type RefObject, useEffect } from "react";
import { BackSide, type Mesh, type Texture } from "three";
import type { Panorama } from "@/panorama/domain/panorama";

interface PanoramaSphereProps {
  panorama: Panorama;
  // Fully-loaded, sRGB-tagged, U-flipped equirect from usePanoramaTexture.
  texture: Texture;
  meshRef: RefObject<Mesh | null>;
  // < 1 ghosts the equirect over the model for overlay calibration.
  opacity?: number;
}

// PanoramaSphere is the equirect skybox. Inverted sphere (BackSide) so the
// camera sees the texture from the inside. Radius=50 puts the sphere well
// outside any practical placement; the placement snap-raycaster uses this
// mesh as its "surface" in panorama mode, so equipment dropped in the
// panorama view ends up at distance ~50 from the anchor.
//
// rotation-y = yawOffset aligns the panorama's implicit "north" with the
// territory's axes. Set per-panorama by the operator who knows the capture
// orientation.
//
// Raycast strategy: pointer events should NOT hit the sphere (a click in the
// open sky should bubble up as onPointerMissed → deselect). But the snap
// raycaster traverses meshes via `userData.origRaycast` first — so we stash
// the default raycast there and disable the public one, matching the same
// trick gltf-model uses for the territory.
export default function PanoramaSphere({ panorama, texture, meshRef, opacity = 1 }: PanoramaSphereProps) {
  // After the mesh mounts, stash the prototype raycast for snap and replace
  // the instance raycast with a noop. Re-runs whenever the mesh identity
  // changes (new panorama → new mesh ref).
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const proto = Object.getPrototypeOf(mesh) as { raycast: Mesh["raycast"] };
    mesh.userData.origRaycast = proto.raycast;
    mesh.raycast = () => {};
    return () => {
      mesh.raycast = proto.raycast;
      delete mesh.userData.origRaycast;
    };
  }, [meshRef, panorama.id]);

  return (
    <mesh
      ref={meshRef}
      position={[panorama.position.x, panorama.position.y, panorama.position.z]}
      rotation={[0, panorama.yawOffset, 0]}
      renderOrder={opacity < 1 ? 1000 : 0}
    >
      <sphereGeometry args={[50, 64, 32]} />
      <meshBasicMaterial
        map={texture}
        side={BackSide}
        toneMapped={false}
        transparent={opacity < 1}
        opacity={opacity}
        depthTest={opacity >= 1}
        depthWrite={opacity >= 1}
      />
    </mesh>
  );
}
```

- [ ] **Step 3: Replace `panorama-scene-layer.tsx` to drive the hook and render the bar**

Replace the entire contents of `frontend/src/panorama/presentation/three/panorama-scene-layer.tsx` with:

```tsx
import { useEffect } from "react";
import type { RefObject } from "react";
import { Html } from "@react-three/drei";
import type { Mesh } from "three";
import type { Panorama } from "@/panorama/domain/panorama";
import type { PanoramaDragApi } from "@/panorama/application/use-panorama-drag";
import { usePanoramaTexture } from "@/panorama/application/use-panorama-texture";
import PanoramaSphere from "@/panorama/presentation/three/panorama-sphere";
import PanoramaRig from "@/panorama/presentation/three/panorama-rig";
import PanoramaLoadingBar from "@/panorama/presentation/components/panorama-loading-bar";
import PanoramaMarkersLayer from "@/panorama/presentation/three/panorama-markers-layer";
import PanoramaDragController from "@/panorama/presentation/three/panorama-drag-controller";

interface PanoramaSceneLayerProps {
  activePanorama: Panorama | null;
  panoramaRef: RefObject<Mesh | null>;
  calibrating: boolean;
  panoramaOpacity: number;
  onPanoramaError: (id: number) => void;
  panoramas: Panorama[];
  onActivatePanorama: (id: number) => void;
  showMarkers: boolean;
  measureMode: boolean;
  // Panorama "Move" mode; undefined when the parent hasn't opted in.
  move?: PanoramaDragApi;
}

// PanoramaSceneLayer is the panorama half of the scene: the equirect sphere
// skybox (when one is active), the clickable/draggable anchor markers (in 3D
// view), and the drag controller that suspends OrbitControls while a marker
// is being moved. While the equirect streams in it shows a full-screen
// progress bar so the switch from the 3D view isn't a blank wait.
export default function PanoramaSceneLayer({
  activePanorama,
  panoramaRef,
  calibrating,
  panoramaOpacity,
  onPanoramaError,
  panoramas,
  onActivatePanorama,
  showMarkers,
  measureMode,
  move,
}: PanoramaSceneLayerProps) {
  const draggingId = move?.draggingId ?? null;
  const { texture, progress, status } = usePanoramaTexture(
    activePanorama?.sourceBlobHash ?? null,
  );

  useEffect(() => {
    if (status === "error" && activePanorama) onPanoramaError(activePanorama.id);
  }, [status, activePanorama, onPanoramaError]);

  return (
    <>
      {activePanorama && status === "loading" && (
        <Html fullscreen>
          <div className="flex h-full w-full items-center justify-center bg-black">
            <PanoramaLoadingBar progress={progress} />
          </div>
        </Html>
      )}

      {activePanorama && status === "ready" && texture && (
        <>
          <PanoramaSphere
            panorama={activePanorama}
            texture={texture}
            meshRef={panoramaRef}
            opacity={calibrating ? panoramaOpacity : 1}
          />
          <PanoramaRig panorama={activePanorama} />
        </>
      )}

      {!activePanorama && !measureMode && showMarkers && (
        <PanoramaMarkersLayer
          panoramas={panoramas}
          onActivate={onActivatePanorama}
          moveMode={move?.moveMode ?? false}
          draggingId={draggingId}
          livePos={move?.livePos ?? null}
          onGrab={move?.begin}
        />
      )}

      <PanoramaDragController
        dragging={draggingId != null}
        onEnd={() => move?.end()}
      />
    </>
  );
}
```

- [ ] **Step 4: Delete the now-unused error boundary**

Run (only if Step 1 confirmed it's unused outside the scene layer):
```bash
git rm frontend/src/panorama/presentation/components/panorama-error-boundary.tsx
```

- [ ] **Step 5: Lint and build**

Run: `cd frontend && yarn lint && yarn build`
Expected: PASS — no lint errors, build succeeds. If the build flags `PanoramaErrorBoundary` as a missing import, re-check that Step 3 removed its import (it did) and re-run.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/panorama/presentation/three/panorama-sphere.tsx frontend/src/panorama/presentation/three/panorama-scene-layer.tsx
git commit -m "feat(panorama): show streaming progress bar on panorama entry"
```

---

### Task 5: Manual browser verification

**Files:** none (verification only).

The hook, drei `<Html>` overlay, and `createImageBitmap` need a real browser + GPU — they can't be exercised by `node --test`. Verify end-to-end.

- [ ] **Step 1: Start the dev server**

Run: `cd frontend && yarn dev`
Note the port (it may pick 3001 if 3000 is busy).

- [ ] **Step 2: Drive the flow**

1. Open a territory that has at least one panorama.
2. Open DevTools → Network, throttle to "Slow 3G" (so the bar is visible long enough to observe).
3. Click a panorama marker/beacon (or the picker in the side panel).
4. Confirm: a black screen with a centered cyan bar appears, the percentage climbs 0→100 (matching the equirect request's downloaded bytes in the Network tab), then the sphere renders. No blank gap.
5. Enter a second panorama, then quickly switch to a third before the second finishes — confirm no crash, no stuck bar, and the final panorama renders correctly.
6. Exit panorama mode (Esc / back to 3D) and confirm markers reappear and no console errors.

- [ ] **Step 3: (Optional) verify the indeterminate fallback**

In DevTools, block the `Content-Length` response header for `/api/assets/*` (or note that if the server omits it), the bar should render the pulsing "…" indeterminate state instead of a percentage, and still resolve to the sphere.

- [ ] **Step 4: Confirm the full check suite**

Run: `cd frontend && yarn test && yarn lint && yarn build`
Expected: all green.

---

## Self-Review

**Spec coverage:**
- Honest 0→100% progress → Task 1 (`readWithProgress`) + Task 2 (hook) + Task 3 (bar). ✓
- Streaming `fetch` + `Content-Length`, removes Suspense for the sphere → Task 2 + Task 4. ✓
- `use-panorama-texture.ts` returns `{ texture, progress, status }`, aborts via `AbortController`, disposes texture → Task 2. ✓
- `panorama-scene-layer.tsx`: black screen + centered bar while loading, sphere+rig when ready, `onPanoramaError` on error → Task 4. ✓
- `panorama-sphere.tsx` takes `texture` prop, no `useLoader` → Task 4. ✓
- Progress bar copied into `panorama/` (not imported from `viewer/`) → Task 3. ✓
- `Content-Length` missing → indeterminate bar → Task 1 (`null`) + Task 3 (indeterminate render) + Task 5 Step 3. ✓
- Cache note as `ponytail:` comment → Task 2. ✓
- Runnable test for progress logic (monotonic to 100; null case) → Task 1. ✓

**Placeholder scan:** No TBD/TODO; every code step shows full code; every command has an expected result. ✓

**Type consistency:** `readWithProgress(res, onProgress) → Promise<Blob>` used identically in Task 1 and Task 2. `usePanoramaTexture(hash: string | null) → { texture, progress, status }` defined in Task 2 and consumed in Task 4. `PanoramaLoadingBar` props `{ progress: number | null }` defined in Task 3 and used in Task 4. `PanoramaSphere` gains `texture: Texture`, passed in Task 4. ✓
