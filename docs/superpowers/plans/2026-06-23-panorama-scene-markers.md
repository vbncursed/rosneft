# Panorama Scene Markers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a camera-facing marker at each panorama's scene position that reveals the panorama title on hover and enters that panorama on click.

**Architecture:** A new R3F layer inside `<SceneCanvas>`, parallel to the placements/measurement layers. Two new presentation components (a single marker + the layer that maps the list). No backend, no data fetching — positions/titles come from the existing `panoramas` list and `usePanoramaOrchestration.activate`.

**Tech Stack:** React 19 / Next 16 / TypeScript, `@react-three/fiber`, `@react-three/drei` 10.7.7 (`Billboard`, `Html`).

## Global Constraints

- File size cap: **200 lines** per file (ESLint `max-lines`).
- Clean Architecture: 3D React in `panorama/presentation/three/`; routes/`ModelViewer` wire it.
- No new npm dependencies.
- User-facing copy in English.
- `@/*` → `frontend/src/*`. All commands run from `frontend/`.
- No frontend test runner: this is a visual/interaction feature with no pure logic; verify with `yarn lint` + `yarn build` + manual check.
- Markers render **only** in the 3D scene view: gated by `!activePanorama && !measureMode`.
- Marker hover/click must `stopPropagation()` (avoid canvas deselect / measure handlers).
- Relies on the territory GLB being non-raycastable outside measure mode (`<GltfModel raycastable={measureMode}>`), so markers drawn over geometry remain clickable through terrain.

---

## File Structure

- Create `frontend/src/panorama/presentation/three/panorama-marker.tsx` — one billboard dot + hover label + click-to-activate for a single panorama.
- Create `frontend/src/panorama/presentation/three/panorama-markers-layer.tsx` — maps the panorama list to markers.
- Modify `frontend/src/viewer/presentation/three/scene-canvas.tsx` — add `panoramas` + `onActivatePanorama` props; render the layer gated by view/mode.
- Modify `frontend/src/viewer/presentation/components/model-viewer.tsx` — pass `panoramas` and `panorama.activate` to `SceneCanvas`.

---

### Task 1: Marker components

**Files:**
- Create: `frontend/src/panorama/presentation/three/panorama-marker.tsx`
- Create: `frontend/src/panorama/presentation/three/panorama-markers-layer.tsx`

**Interfaces:**
- Consumes: `Panorama` from `@/panorama/domain/panorama` (`{ id: number; title: string; position: Vec3; ... }`).
- Produces:
  - `PanoramaMarker` (default export), props `{ panorama: Panorama; onActivate: (id: number) => void }`.
  - `PanoramaMarkersLayer` (default export), props `{ panoramas: Panorama[]; onActivate: (id: number) => void }`.

- [ ] **Step 1: Create the single marker** — `frontend/src/panorama/presentation/three/panorama-marker.tsx`

```tsx
import { useCallback, useState } from "react";
import { Billboard, Html } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import type { Panorama } from "@/panorama/domain/panorama";

interface PanoramaMarkerProps {
  panorama: Panorama;
  onActivate: (id: number) => void;
}

// Visible dot, plus a larger invisible sphere as a comfortable click/hover
// target. depthTest off + high renderOrder draws the dot over scene
// geometry, matching the measurement-overlay convention.
const DOT_RADIUS = 0.03;
const HIT_RADIUS = 0.08;
const RENDER_ORDER = 999;
const DOT_COLOR = "#67e8f9";

// PanoramaMarker is a camera-facing dot at a panorama's anchor. Hover
// reveals the title; click enters that panorama. stopPropagation keeps the
// canvas-level deselect (onPointerMissed) from also firing.
export default function PanoramaMarker({
  panorama,
  onActivate,
}: PanoramaMarkerProps) {
  const [hovered, setHovered] = useState(false);

  const handleOver = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    setHovered(true);
    document.body.style.cursor = "pointer";
  }, []);

  const handleOut = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    setHovered(false);
    document.body.style.cursor = "";
  }, []);

  const handleClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      onActivate(panorama.id);
    },
    [onActivate, panorama.id],
  );

  const { x, y, z } = panorama.position;

  return (
    <Billboard position={[x, y, z]}>
      <mesh onPointerOver={handleOver} onPointerOut={handleOut} onClick={handleClick}>
        <sphereGeometry args={[HIT_RADIUS, 16, 16]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <mesh renderOrder={RENDER_ORDER}>
        <circleGeometry args={[DOT_RADIUS, 24]} />
        <meshBasicMaterial color={DOT_COLOR} depthTest={false} depthWrite={false} transparent />
      </mesh>
      {hovered && (
        <Html
          center
          zIndexRange={[20, 10]}
          style={{ transform: "translate(-50%, calc(-100% - 14px))" }}
        >
          <div className="pointer-events-none select-none whitespace-nowrap rounded-md border border-cyan-300/40 bg-black/80 px-2 py-0.5 text-[10px] font-medium leading-tight text-cyan-100 shadow-md backdrop-blur-sm">
            {panorama.title}
          </div>
        </Html>
      )}
    </Billboard>
  );
}
```

- [ ] **Step 2: Create the layer** — `frontend/src/panorama/presentation/three/panorama-markers-layer.tsx`

```tsx
import type { Panorama } from "@/panorama/domain/panorama";
import PanoramaMarker from "@/panorama/presentation/three/panorama-marker";

interface PanoramaMarkersLayerProps {
  panoramas: Panorama[];
  onActivate: (id: number) => void;
}

// PanoramaMarkersLayer renders a camera-facing marker at every panorama's
// anchor. The parent gates mounting to the 3D scene view (not inside a
// panorama, not in measure mode).
export default function PanoramaMarkersLayer({
  panoramas,
  onActivate,
}: PanoramaMarkersLayerProps) {
  return (
    <>
      {panoramas.map((p) => (
        <PanoramaMarker key={p.id} panorama={p} onActivate={onActivate} />
      ))}
    </>
  );
}
```

- [ ] **Step 3: Type-check / build (components compile)**

Run: `yarn build`
Expected: `Compiled successfully` + `Finished TypeScript`. (The components are not yet referenced, but must type-check.)

- [ ] **Step 4: Commit**

```bash
git add src/panorama/presentation/three/panorama-marker.tsx \
        src/panorama/presentation/three/panorama-markers-layer.tsx
git commit -m "feat(panorama): in-scene marker components (billboard dot + hover label)"
```

---

### Task 2: Wire markers into the scene

**Files:**
- Modify: `frontend/src/viewer/presentation/three/scene-canvas.tsx`
- Modify: `frontend/src/viewer/presentation/components/model-viewer.tsx`

**Interfaces:**
- Consumes: `PanoramaMarkersLayer` (`{ panoramas: Panorama[]; onActivate: (id: number) => void }`), `Panorama` type (already imported in `scene-canvas.tsx`), `usePanoramaOrchestration().activate: (id: number | null) => void`.
- Produces: `SceneCanvas` gains props `panoramas: Panorama[]` and `onActivatePanorama: (id: number) => void`.

- [ ] **Step 1: Import the layer in `scene-canvas.tsx`**

Add after the existing `PanoramaErrorBoundary` import (near the other panorama imports):

```ts
import PanoramaMarkersLayer from "@/panorama/presentation/three/panorama-markers-layer";
```

- [ ] **Step 2: Add the two props to `SceneCanvasProps`**

In `interface SceneCanvasProps`, immediately after the `activePanorama: Panorama | null;` field, add:

```ts
  // Full panorama list + activator for the in-scene markers shown in 3D view.
  panoramas: Panorama[];
  onActivatePanorama: (id: number) => void;
```

- [ ] **Step 3: Destructure the new props**

In the `export default function SceneCanvas({ ... })` parameter list, after `activePanorama,` add:

```ts
  panoramas,
  onActivatePanorama,
```

- [ ] **Step 4: Render the markers layer (gated)**

In the JSX, immediately after the closing `)}` of the `{activePanorama && ( ... )}` block (the panorama sphere block) and before the placements `<Suspense>`, insert:

```tsx
        {!activePanorama && !measureMode && (
          <PanoramaMarkersLayer panoramas={panoramas} onActivate={onActivatePanorama} />
        )}
```

- [ ] **Step 5: Pass the props from `model-viewer.tsx`**

In the `<SceneCanvas ... />` element, after the existing `activePanorama={panorama.activePanorama}` prop, add:

```tsx
        panoramas={panoramas}
        onActivatePanorama={panorama.activate}
```

- [ ] **Step 6: Lint and build**

Run: `yarn lint && yarn build`
Expected: lint `Done` with no errors/warnings; build `Compiled successfully` + `Finished TypeScript`.

- [ ] **Step 7: Commit**

```bash
git add src/viewer/presentation/three/scene-canvas.tsx \
        src/viewer/presentation/components/model-viewer.tsx
git commit -m "feat(panorama): show clickable panorama markers in the 3D scene"
```

- [ ] **Step 8: Manual verification (operator)**

Deploy, open a territory with panoramas in 3D view. Expect a cyan dot at each panorama anchor; hovering a dot shows its title; clicking enters that panorama (and opens its panel). Markers disappear once inside a panorama and while measure mode (M) is active, and reappear on returning to the 3D scene.

---

## Self-Review

**Spec coverage:**
- Billboard glowing cyan dot over geometry → Task 1 `<Billboard>` + `circleGeometry` + `depthTest={false}` + `renderOrder={999}`. ✓
- Title on hover via `<Html>` → Task 1 `hovered` gate + `<Html>`. ✓
- Click → `activate(id)` → Task 1 `onClick` → `onActivate`; Task 2 Step 5 wires `onActivatePanorama={panorama.activate}`. ✓
- All panoramas incl. origin → Task 1 layer maps the full list, no filtering. ✓
- Visible only in 3D view (hidden inside panorama + measure mode) → Task 2 Step 4 gate `!activePanorama && !measureMode`. ✓
- No deselect on click → Task 1 `stopPropagation()` in handlers. ✓
- Comfortable hit target → Task 1 invisible `HIT_RADIUS` sphere. ✓
- Frontend-only, no backend → only presentation files touched. ✓
- Out of scope (distance scaling, edit/delete from marker) → not included. ✓

**Placeholder scan:** none — all steps contain full code/commands.

**Type consistency:** `PanoramaMarker` props `{ panorama: Panorama; onActivate: (id: number) => void }` and `PanoramaMarkersLayer` props `{ panoramas: Panorama[]; onActivate: (id: number) => void }` are used identically in Task 2. `onActivatePanorama: (id: number) => void` matches `usePanoramaOrchestration.activate: (id: number | null) => void` (passing a `number` is assignable). `Panorama` type already imported in `scene-canvas.tsx`. ✓
