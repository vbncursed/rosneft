# Panorama Marker Drag — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an operator drag a panorama marker across the territory mesh in a dedicated "Move" mode; the drop position auto-saves.

**Architecture:** A new `moveMode` (mirrors `measureMode`) gates a drag gesture on the existing drei `<Html>` markers. Pointer-down on a marker grabs it; pointer-move raycasts the territory mesh (`intersections[0].point`, same as the measure tool) and the marker follows; pointer-up commits via the existing optimistic `usePanoramas.update(id, {position})`. Pure drag-state transitions live in a domain module; a thin hook wraps them; R3F wiring disables OrbitControls during the drag.

**Tech Stack:** Next.js 16 / React 19, `@react-three/fiber` + `@react-three/drei`, TypeScript strict, Node built-in test runner (`node --test`, no framework).

## Global Constraints

- **Do not break existing functionality.** The feature is fully additive and active only inside `moveMode`. Outside the mode, marker click-to-enter, calibration, edit panel, measure, and placements behave exactly as today. New props on shared R3F components are OPTIONAL with defaults that reproduce current behavior.
- **Hard cap 200 lines per file** (ESLint `max-lines`, skipBlankLines + skipComments).
- **Clean Architecture + DDD layers:** drag transitions in `domain/`, hook in `application/`, R3F components in `presentation/three/`, toggle button in `presentation/components/`.
- **No new dependencies.** Reuse raycast-point (measure), `useThree(s=>s.controls)` (CameraRig sets `set({controls})`), and `usePanoramas.update` (optimistic PUT + rollback + toast).
- **Presentation is client-only.** Permission reads (`useCan()`) happen outside the R3F Canvas and arrive as props/gates.
- Run commands from `frontend/`. Lint: `yarn lint`. Typecheck/build: `yarn build`. Unit tests: `yarn test`.
- No brand word "Rosneft"/"Роснефть" in any displayed text (UI copy is "Andrey" brand); lowercase `rosneft` paths are structural.

---

### Task 1: Drag-state domain module

**Files:**
- Create: `frontend/src/panorama/domain/marker-drag.ts`
- Test: `frontend/src/panorama/domain/marker-drag.test.ts`

**Interfaces:**
- Consumes: `Vec3` from `@/shared/domain/vec3`.
- Produces:
  - `interface DragState { draggingId: number | null; livePos: Vec3 | null }`
  - `const IDLE: DragState`
  - `begin(id: number): DragState`
  - `move(state: DragState, point: Vec3): DragState`
  - `dropTarget(state: DragState): { id: number; position: Vec3 } | null`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/panorama/domain/marker-drag.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { IDLE, begin, move, dropTarget } from "./marker-drag.ts";

const p1 = { x: 1, y: 0, z: 0 };
const p2 = { x: 2, y: 0, z: 3 };

test("begin sets draggingId and clears livePos", () => {
  const s = begin(7);
  assert.equal(s.draggingId, 7);
  assert.equal(s.livePos, null);
});

test("move records the last point while grabbed", () => {
  const s = move(move(begin(7), p1), p2);
  assert.deepEqual(s.livePos, p2);
  assert.equal(s.draggingId, 7);
});

test("move without a grab is ignored", () => {
  assert.deepEqual(move(IDLE, p1), IDLE);
});

test("dropTarget returns id+position after a move", () => {
  assert.deepEqual(dropTarget(move(begin(7), p2)), { id: 7, position: p2 });
});

test("dropTarget is null for a grab with no move (plain click)", () => {
  assert.equal(dropTarget(begin(7)), null);
  assert.equal(dropTarget(IDLE), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && yarn test`
Expected: FAIL — cannot find module `./marker-drag.ts` / exports undefined.

- [ ] **Step 3: Write minimal implementation**

Create `frontend/src/panorama/domain/marker-drag.ts`:

```ts
import type { Vec3 } from "@/shared/domain/vec3";

// Transient state of dragging one panorama marker across the mesh. Pure
// transitions so the interaction logic is testable without React / R3F.
// Mirrors placement/domain/mutation-state.ts (pure state + constructors).
export interface DragState {
  // Panorama id currently grabbed, or null when nothing is being dragged.
  draggingId: number | null;
  // Last valid surface point under the cursor; null until the first move.
  livePos: Vec3 | null;
}

export const IDLE: DragState = { draggingId: null, livePos: null };

export function begin(id: number): DragState {
  return { draggingId: id, livePos: null };
}

// A move only registers while a marker is grabbed; otherwise it's ignored.
export function move(state: DragState, point: Vec3): DragState {
  return state.draggingId === null
    ? state
    : { draggingId: state.draggingId, livePos: point };
}

// The commit target read on pointer-up: id + position, or null when the
// grab produced no surface point (a plain click) so nothing is persisted.
export function dropTarget(
  state: DragState,
): { id: number; position: Vec3 } | null {
  return state.draggingId !== null && state.livePos !== null
    ? { id: state.draggingId, position: state.livePos }
    : null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && yarn test`
Expected: PASS — all 5 tests green.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/panorama/domain/marker-drag.ts frontend/src/panorama/domain/marker-drag.test.ts
git commit -m "feat(panorama): pure drag-state transitions for marker drag"
```

---

### Task 2: usePanoramaDrag hook

**Files:**
- Create: `frontend/src/panorama/application/use-panorama-drag.ts`

**Interfaces:**
- Consumes: `IDLE, begin, move, dropTarget, DragState` from `@/panorama/domain/marker-drag`; `Vec3`.
- Produces: `usePanoramaDrag(onCommit: (id: number, position: Vec3) => void)` returning:
  `{ moveMode: boolean; draggingId: number | null; livePos: Vec3 | null; toggle(): void; exit(): void; begin(id: number): void; move(point: Vec3): void; end(): void }`

**Note:** No unit test — this is React glue (the project tests only pure domain logic; see the two existing `*.test.ts`). Its gate is `yarn build` + `yarn lint`. The testable logic already lives in Task 1. `onCommit` is read via a ref-free `useCallback` dep; the latest `DragState` for the commit is read from a ref (StrictMode-safe — no side effects inside a setState updater), mirroring `placementsRef` in `use-placements-editor.ts`.

- [ ] **Step 1: Write the implementation**

Create `frontend/src/panorama/application/use-panorama-drag.ts`:

```ts
import { useCallback, useRef, useState } from "react";
import type { Vec3 } from "@/shared/domain/vec3";
import {
  IDLE,
  begin,
  move,
  dropTarget,
  type DragState,
} from "@/panorama/domain/marker-drag";

// usePanoramaDrag owns the "Move" sub-mode plus the transient state of the
// marker currently being dragged. `onCommit` persists the drop (optimistic
// PUT lives in usePanoramas.update). Toggling the mode off — or exit() /
// Esc — clears any in-flight drag WITHOUT committing.
//
// The live DragState is mirrored in a ref so end() can read the latest
// drop point without putting a side effect inside a setState updater
// (which React 19 StrictMode double-invokes — that would double-PUT).
export function usePanoramaDrag(
  onCommit: (id: number, position: Vec3) => void,
) {
  const [moveMode, setMoveMode] = useState(false);
  const [drag, setDrag] = useState<DragState>(IDLE);
  const dragRef = useRef<DragState>(IDLE);

  const apply = useCallback((next: DragState) => {
    dragRef.current = next;
    setDrag(next);
  }, []);

  const toggle = useCallback(() => {
    setMoveMode((v) => !v);
    apply(IDLE);
  }, [apply]);

  const exit = useCallback(() => {
    setMoveMode(false);
    apply(IDLE);
  }, [apply]);

  const beginDrag = useCallback((id: number) => apply(begin(id)), [apply]);

  const moveDrag = useCallback(
    (point: Vec3) => apply(move(dragRef.current, point)),
    [apply],
  );

  const endDrag = useCallback(() => {
    const target = dropTarget(dragRef.current);
    if (target) onCommit(target.id, target.position);
    apply(IDLE);
  }, [apply, onCommit]);

  return {
    moveMode,
    draggingId: drag.draggingId,
    livePos: drag.livePos,
    toggle,
    exit,
    begin: beginDrag,
    move: moveDrag,
    end: endDrag,
  };
}
```

- [ ] **Step 2: Verify build + lint**

Run: `cd frontend && yarn build && yarn lint`
Expected: build succeeds, no lint errors, file under 200 lines.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/panorama/application/use-panorama-drag.ts
git commit -m "feat(panorama): usePanoramaDrag hook (move mode + drag state)"
```

---

### Task 3: R3F wiring — markers become draggable in the scene

Adds the drag gesture to the markers and the scene, all behind OPTIONAL props so existing callers (and thus existing behavior) are unchanged until Task 4 turns the feature on.

**Files:**
- Create: `frontend/src/panorama/presentation/three/panorama-drag-controller.tsx`
- Modify: `frontend/src/panorama/presentation/three/panorama-marker.tsx`
- Modify: `frontend/src/panorama/presentation/three/panorama-markers-layer.tsx`
- Modify: `frontend/src/viewer/presentation/three/scene-canvas.tsx`

**Interfaces:**
- Consumes: `Vec3`; `useThree` from `@react-three/fiber`; existing `PanoramaMarkersLayer`, `GltfModel`.
- Produces (new OPTIONAL props threaded ModelViewer→SceneCanvas→Layer→Marker):
  - SceneCanvas: `moveMode?: boolean`, `draggingPanoramaId?: number | null`, `draggingPanoramaPos?: Vec3 | null`, `onPanoramaGrab?: (id: number) => void`, `onPanoramaDragMove?: (point: Vec3) => void`, `onPanoramaDragEnd?: () => void`.
  - `PanoramaDragController` component: `{ dragging: boolean; onEnd: () => void }` (returns null; runs the OrbitControls-disable + window pointerup lifecycle inside the Canvas).

- [ ] **Step 1: Create the drag controller (OrbitControls disable + window pointer-up)**

Create `frontend/src/panorama/presentation/three/panorama-drag-controller.tsx`:

```tsx
import { useEffect } from "react";
import { useThree } from "@react-three/fiber";

interface PanoramaDragControllerProps {
  dragging: boolean;
  onEnd: () => void;
}

// While a marker is grabbed, OrbitControls must not rotate the camera, and
// the drag must end even if the pointer is released off the mesh — so we
// listen on window for pointerup. Lives INSIDE the Canvas because it needs
// useThree to reach the controls CameraRig registered via set({controls}).
// Renders nothing.
export default function PanoramaDragController({
  dragging,
  onEnd,
}: PanoramaDragControllerProps) {
  const controls = useThree(
    (s) => s.controls as { enabled: boolean } | null,
  );

  useEffect(() => {
    if (!dragging) return;
    if (controls) controls.enabled = false;
    const up = () => onEnd();
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointerup", up);
      if (controls) controls.enabled = true;
    };
  }, [dragging, controls, onEnd]);

  return null;
}
```

- [ ] **Step 2: Add the grab gesture to the marker**

Modify `frontend/src/panorama/presentation/three/panorama-marker.tsx`.

Replace the imports and props interface at the top:

```tsx
import { useState } from "react";
import { Html } from "@react-three/drei";
import type { Panorama } from "@/panorama/domain/panorama";
import type { Vec3 } from "@/shared/domain/vec3";

interface PanoramaMarkerProps {
  panorama: Panorama;
  onActivate: (id: number) => void;
  // Move-mode drag (all optional; default = today's click-to-enter behavior).
  moveMode?: boolean;
  dragging?: boolean;
  livePos?: Vec3 | null;
  onGrab?: (id: number) => void;
}
```

Update the component signature and the position source:

```tsx
export default function PanoramaMarker({
  panorama,
  onActivate,
  moveMode = false,
  dragging = false,
  livePos = null,
  onGrab,
}: PanoramaMarkerProps) {
  const [hovered, setHovered] = useState(false);
  // While this marker is being dragged, render it at the live surface point
  // so it tracks the cursor; otherwise at its saved anchor.
  const pos = dragging && livePos ? livePos : panorama.position;
  const { x, y, z } = pos;
```

Replace the `<button>` element (keep the two `<span>` glow layers inside it unchanged) so its handlers and cursor branch on `moveMode`:

```tsx
        <button
          type="button"
          onPointerDown={
            moveMode
              ? (e) => {
                  e.stopPropagation();
                  onGrab?.(panorama.id);
                }
              : undefined
          }
          onClick={
            moveMode
              ? undefined
              : (e) => {
                  e.stopPropagation();
                  onActivate(panorama.id);
                }
          }
          onPointerEnter={() => setHovered(true)}
          onPointerLeave={() => setHovered(false)}
          aria-label={
            moveMode
              ? `Move panorama ${panorama.title}`
              : `Open panorama ${panorama.title}`
          }
          className={`group relative grid h-6 w-6 place-items-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 ${
            moveMode ? (dragging ? "cursor-grabbing" : "cursor-grab") : "cursor-pointer"
          } ${dragging ? "pointer-events-none" : ""}`}
        >
```

> Why `pointer-events-none` while dragging: the grab starts on this button's `pointerdown`; setting the button non-interactive on the next render lets subsequent `pointermove`/`pointerup` reach the R3F canvas (mesh raycast) and `window` (drag end) instead of the DOM overlay.

- [ ] **Step 3: Thread the props through the markers layer**

Modify `frontend/src/panorama/presentation/three/panorama-markers-layer.tsx` in full:

```tsx
import type { Panorama } from "@/panorama/domain/panorama";
import type { Vec3 } from "@/shared/domain/vec3";
import PanoramaMarker from "@/panorama/presentation/three/panorama-marker";

interface PanoramaMarkersLayerProps {
  panoramas: Panorama[];
  onActivate: (id: number) => void;
  // Move-mode drag (optional; default = today's behavior).
  moveMode?: boolean;
  draggingId?: number | null;
  livePos?: Vec3 | null;
  onGrab?: (id: number) => void;
}

// PanoramaMarkersLayer renders a camera-facing marker at every panorama's
// anchor. The parent gates mounting to the 3D scene view (not inside a
// panorama, not in measure mode).
export default function PanoramaMarkersLayer({
  panoramas,
  onActivate,
  moveMode = false,
  draggingId = null,
  livePos = null,
  onGrab,
}: PanoramaMarkersLayerProps) {
  return (
    <>
      {panoramas.map((p) => (
        <PanoramaMarker
          key={p.id}
          panorama={p}
          onActivate={onActivate}
          moveMode={moveMode}
          dragging={draggingId === p.id}
          livePos={livePos}
          onGrab={onGrab}
        />
      ))}
    </>
  );
}
```

- [ ] **Step 4: Wire the scene canvas (raycast + move handler + controller)**

Modify `frontend/src/viewer/presentation/three/scene-canvas.tsx`.

Add the import near the other panorama imports (after the `PanoramaMarkersLayer` import):

```tsx
import PanoramaDragController from "@/panorama/presentation/three/panorama-drag-controller";
import { useThree } from "@react-three/fiber";
```

> `useThree` is already needed only inside the Canvas; here it is imported for the controller's own use — do NOT call `useThree` in the `SceneCanvas` body (that runs outside the Canvas). The added import line is fine if `useThree` is not already imported; if `ThreeEvent` is imported from `@react-three/fiber`, extend that existing import instead of adding a duplicate.

Add the six optional props to `SceneCanvasProps` (place after `onActivatePanorama`):

```tsx
  // Panorama "Move" mode: drag markers across the mesh. All optional so the
  // scene behaves exactly as before until ModelViewer opts in.
  moveMode?: boolean;
  draggingPanoramaId?: number | null;
  draggingPanoramaPos?: Vec3 | null;
  onPanoramaGrab?: (id: number) => void;
  onPanoramaDragMove?: (point: Vec3) => void;
  onPanoramaDragEnd?: () => void;
```

Add them to the destructured params (with defaults) in the function signature, after `onActivatePanorama`:

```tsx
  moveMode = false,
  draggingPanoramaId = null,
  draggingPanoramaPos = null,
  onPanoramaGrab,
  onPanoramaDragMove,
  onPanoramaDragEnd,
```

Add a pointer-move handler next to `handleSceneClick` (inside the component body):

```tsx
  // While dragging a panorama marker, project the cursor onto the territory
  // surface (first hit) and report it. Same point source as the measure
  // tool. Early-returns when not dragging so normal hovering pays nothing.
  const handlePointerMove = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      if (!moveMode || draggingPanoramaId == null) return;
      const hit = event.intersections[0]?.point;
      if (!hit) return;
      event.stopPropagation();
      onPanoramaDragMove?.({ x: hit.x, y: hit.y, z: hit.z });
    },
    [moveMode, draggingPanoramaId, onPanoramaDragMove],
  );
```

Make the territory raycastable in move mode too — change the `<GltfModel>` line:

```tsx
            <GltfModel lods={parentLods} raycastable={measureMode || moveMode} groupRef={territoryRef} />
```

Attach the move handler to the wrapper group — change the opening tag:

```tsx
      <group onClick={handleSceneClick} onPointerMove={handlePointerMove}>
```

Thread the drag props into the markers layer — replace the `PanoramaMarkersLayer` block:

```tsx
        {!activePanorama && !measureMode && showMarkers && (
          <PanoramaMarkersLayer
            panoramas={panoramas}
            onActivate={onActivatePanorama}
            moveMode={moveMode}
            draggingId={draggingPanoramaId}
            livePos={draggingPanoramaPos}
            onGrab={onPanoramaGrab}
          />
        )}
```

Render the controller inside the Canvas (add next to `<CameraRig ... />`):

```tsx
      <PanoramaDragController
        dragging={draggingPanoramaId != null}
        onEnd={() => onPanoramaDragEnd?.()}
      />
```

- [ ] **Step 5: Verify build + lint (behavior unchanged)**

Run: `cd frontend && yarn build && yarn lint`
Expected: build succeeds; no lint errors; every touched file under 200 lines. Because ModelViewer does not pass the new props yet, `moveMode` is `false` everywhere and the scene behaves exactly as before.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/panorama/presentation/three/panorama-drag-controller.tsx \
        frontend/src/panorama/presentation/three/panorama-marker.tsx \
        frontend/src/panorama/presentation/three/panorama-markers-layer.tsx \
        frontend/src/viewer/presentation/three/scene-canvas.tsx
git commit -m "feat(panorama): drag gesture wiring on markers + scene (behind optional props)"
```

---

### Task 4: Turn the feature on — Move toggle, hotkey, and mode wiring

Instantiates the hook in `ModelViewer`, feeds the real drag props to `SceneCanvas`, adds the "Move" toggle button to the panorama section, binds the `V` hotkey, and makes the mode mutually exclusive with measure/selection. This is the first end-to-end testable point.

**Files:**
- Modify: `frontend/src/viewer/presentation/components/model-viewer.tsx`
- Modify: `frontend/src/panorama/presentation/components/panorama-section.tsx`

**Interfaces:**
- Consumes: `usePanoramaDrag` (Task 2); `updatePanoramaState` (already in ModelViewer, from `usePanoramas`); the optional SceneCanvas props (Task 3).
- Produces: `PanoramaSection` gains props `moveMode: boolean`, `onToggleMove: () => void`.

- [ ] **Step 1: Instantiate the hook and mode coordination in ModelViewer**

Modify `frontend/src/viewer/presentation/components/model-viewer.tsx`.

Add the import (near the other panorama application imports):

```tsx
import { usePanoramaDrag } from "@/panorama/application/use-panorama-drag";
```

After `const canEditPlacements = useCan()("placement:write");` add:

```tsx
  // Panorama "Move" mode. Commit = the same optimistic PUT the edit panel
  // uses; only position changes (title/yaw preserved by patch semantics).
  const canMovePanorama = useCan()("panorama:write");
  const panoramaDrag = usePanoramaDrag(
    useCallback(
      (id: number, position: Vec3) => updatePanoramaState(id, { position }),
      [updatePanoramaState],
    ),
  );

  // Entering Move exits measure and drops any gizmo selection so the modes
  // never fight; gated on permission so the V hotkey can't bypass the
  // permission-gated button.
  const handleToggleMove = useCallback(() => {
    if (!canMovePanorama) return;
    if (!panoramaDrag.moveMode) {
      measure.exit();
      editor.setSelectedId(null);
    }
    panoramaDrag.toggle();
  }, [canMovePanorama, panoramaDrag, measure, editor]);
```

Update `handleToggleMeasure` so entering measure also exits Move (replace the existing callback):

```tsx
  const handleToggleMeasure = useCallback(() => {
    if (!measure.measureMode) {
      editor.setSelectedId(null);
      panoramaDrag.exit();
    }
    measure.toggle();
  }, [editor, measure, panoramaDrag]);
```

Make Esc exit Move first (add this as the FIRST statement inside `handleEscape`, before the measure branch):

```tsx
    if (panoramaDrag.moveMode) {
      panoramaDrag.exit();
      return;
    }
```

Add the `panoramaDrag` dependency to `handleEscape`'s dependency array: `[editor, measure, panoramaDrag]`.

Bind the `V` hotkey — add one entry to the `useKeyboardShortcuts({...})` map:

```tsx
    v: handleToggleMove,
```

- [ ] **Step 2: Feed the real drag props to SceneCanvas**

In the same file, add these props to the `<SceneCanvas ... />` element (after `onActivatePanorama={panorama.activate}`):

```tsx
        moveMode={panoramaDrag.moveMode}
        draggingPanoramaId={panoramaDrag.draggingId}
        draggingPanoramaPos={panoramaDrag.livePos}
        onPanoramaGrab={panoramaDrag.begin}
        onPanoramaDragMove={panoramaDrag.move}
        onPanoramaDragEnd={panoramaDrag.end}
```

- [ ] **Step 3: Pass Move state into the panorama section**

In the same file, add two props to the `<PanoramaSection ... />` element (inside the `view={...}` of `OverlaysPanel`, after `onToggleMarkers={toggleMarkers}`):

```tsx
              moveMode={panoramaDrag.moveMode}
              onToggleMove={handleToggleMove}
```

- [ ] **Step 4: Add the Move toggle button to the panorama section**

Modify `frontend/src/panorama/presentation/components/panorama-section.tsx`.

Add the two props to `PanoramaSectionProps` (after `onToggleMarkers`):

```tsx
  // Panorama "Move" mode: drag markers on the mesh. Toggled here; gated on
  // panorama:write (same as the other edit affordances in this section).
  moveMode: boolean;
  onToggleMove: () => void;
```

Add them to the destructured params (after `onToggleMarkers`):

```tsx
  moveMode,
  onToggleMove,
```

Insert the button immediately AFTER the existing "Hide/Show panorama points" `{panoramas.length > 0 ? (...) : null}` block and before `<ExternalPanoramaControl ...>`:

```tsx
      {canWrite && panoramas.length > 0 ? (
        <button
          type="button"
          onClick={onToggleMove}
          aria-pressed={moveMode}
          title="Drag panorama points on the model (V)"
          className={`flex cursor-pointer items-center justify-center gap-2 rounded-md border px-3 py-1.5 text-[11px] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 ${
            moveMode
              ? "border-cyan-300/60 bg-cyan-500/15 text-cyan-100 hover:bg-cyan-500/20"
              : "border-white/15 text-neutral-200 hover:border-cyan-400/60 hover:text-cyan-200"
          }`}
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            width="14"
            height="14"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 3v18M3 12h18M12 3l-2.5 2.5M12 3l2.5 2.5M12 21l-2.5-2.5M12 21l2.5-2.5M3 12l2.5-2.5M3 12l2.5 2.5M21 12l-2.5-2.5M21 12l-2.5 2.5" />
          </svg>
          <span>{moveMode ? "Moving points" : "Move points"}</span>
          <kbd className="rounded border border-current/40 px-1 text-[10px] opacity-70">
            V
          </kbd>
        </button>
      ) : null}
```

- [ ] **Step 5: Verify build + lint**

Run: `cd frontend && yarn build && yarn lint`
Expected: build succeeds; no lint errors; both files under 200 lines.

- [ ] **Step 6: Manual end-to-end verification**

Run: `cd frontend && yarn dev`, then in a browser open a territory that has at least one panorama (`/territories/{slug}`), signed in as a user with `panorama:write`.

Confirm the NEW behavior:
1. The panorama section shows a **"Move points"** button (cyan/glass, four-way-arrow glyph, `V` kbd).
2. Click it (or press `V`) → label becomes **"Moving points"**, `aria-pressed=true`.
3. Press-drag a marker across the model → the marker follows the cursor along the mesh surface; the camera does NOT orbit during the drag.
4. Release → the marker stays; reload the page → the new position persisted.
5. A failed PUT (e.g. offline) shows an error toast and the marker snaps back (rollback from `usePanoramas.update`).

Confirm EXISTING behavior is intact:
6. With Move mode OFF, clicking a marker still enters the panorama.
7. Pressing `M` / the Measure button still measures; entering measure turns Move off (and vice versa).
8. `Esc` exits Move mode; OrbitControls works normally afterward.
9. A user WITHOUT `panorama:write` sees no Move button, and `V` does nothing.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/viewer/presentation/components/model-viewer.tsx \
        frontend/src/panorama/presentation/components/panorama-section.tsx
git commit -m "feat(panorama): Move mode toggle + drag-to-reposition markers"
```

---

## Self-Review

**Spec coverage:**
- Surface-slide drag (height = touch point) → Task 3 Step 4 (`intersections[0].point`, `raycastable={measureMode || moveMode}`). ✓
- Dedicated "Move" mode, toggle + hotkey → Task 4 Steps 1, 4 (`handleToggleMove`, `v:`, button). ✓
- Auto-save on drop via `usePanoramas.update(id,{position})` → Task 2 (`end` → `onCommit`) + Task 4 Step 1 (`onCommit` = `updatePanoramaState`). ✓
- Click vs drag disambiguation via mode (no threshold) → Task 3 Step 2 (`onPointerDown` grab vs `onClick` activate branch on `moveMode`). ✓
- OrbitControls disabled during drag + robust drag-end → Task 3 Step 1 (`PanoramaDragController`). ✓
- Mode mutual exclusion + Esc + permission gate → Task 4 Step 1. ✓
- Rollback/toast on PUT failure → reused from `usePanoramas.update` (no code); verified Task 4 Step 6.5. ✓
- Do-not-break constraint → optional props with defaults (Task 3), existing-behavior checks (Task 4 Step 6.6–6.9). ✓
- One runnable test on non-trivial logic → Task 1 (`marker-drag.test.ts`). ✓

**Placeholder scan:** No TBD/TODO; every code step shows full code; commands have expected output.

**Type consistency:** `DragState`/`begin`/`move`/`dropTarget` (Task 1) match hook usage (Task 2). Hook return keys `moveMode/draggingId/livePos/toggle/exit/begin/move/end` match ModelViewer usage (Task 4). SceneCanvas prop names (`moveMode/draggingPanoramaId/draggingPanoramaPos/onPanoramaGrab/onPanoramaDragMove/onPanoramaDragEnd`) match between Task 3 definition and Task 4 usage. Marker/layer prop names (`moveMode/dragging/draggingId/livePos/onGrab`) consistent across Task 3.
