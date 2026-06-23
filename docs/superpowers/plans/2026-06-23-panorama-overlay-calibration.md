# Panorama Overlay Calibration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an overlay calibration mode that ghosts the panorama photo over the 3D model so the operator can align anchor position + yaw live until placements/features match.

**Architecture:** A calibration sub-mode layered on the existing panorama orchestration. Pure helpers in `panorama/domain/calibration.ts`; a `usePanoramaCalibration` hook owning a live draft; the sphere gains an opacity prop; the rig follows live anchor nudges while preserving look direction; a dedicated calibration panel drives it. Frontend only — Save reuses `updatePanorama`.

**Tech Stack:** React 19 / Next 16 / TypeScript, `@react-three/fiber`, `@react-three/drei`, `three`.

## Global Constraints

- File size cap: **200 lines** per file (ESLint `max-lines`).
- Clean Architecture: pure logic in `domain/`, hooks in `application/`, React/three in `presentation/`.
- No new npm dependencies. User-facing copy in English.
- `@/*` → `frontend/src/*`. All commands run from `frontend/`.
- No frontend test runner: verify pure logic with `node --experimental-strip-types`; everything else with `yarn lint` + `yarn build` + manual.
- Camera in calibration stays at the anchor (rotate only). Opacity clamped to `0.15`–`1`.
- Closing the panel / Exit discards the unsaved draft (Save is explicit).

---

## File Structure

- Create `frontend/src/panorama/domain/calibration.ts` — pure: `nudgePosition`, `clampOpacity`, `applyCalibration`, `CalibrationDraft`.
- Create `frontend/src/panorama/application/use-panorama-calibration.ts` — calibration state/draft/opacity hook.
- Create `frontend/src/panorama/presentation/components/panorama-calibration-panel.tsx` — calibration controls UI.
- Modify `frontend/src/panorama/presentation/three/panorama-sphere.tsx` — `opacity` prop.
- Modify `frontend/src/panorama/presentation/three/panorama-rig.tsx` — live anchor follow preserving look direction.
- Modify `frontend/src/viewer/presentation/three/scene-canvas.tsx` — `calibrating` + `panoramaOpacity` props.
- Modify `frontend/src/viewer/presentation/components/model-viewer.tsx` — compose the hook, feed the scene + section.
- Modify `frontend/src/panorama/presentation/components/panorama-edit-panel.tsx` — "Calibrate (overlay)" button.
- Modify `frontend/src/panorama/presentation/components/panorama-section.tsx` — render the calibration panel while calibrating.

**Note (deviation from spec):** "Set from camera" is omitted from the calibration panel — in calibration the camera is locked at the anchor, so it would be a no-op. Coarse positioning stays in the normal edit panel (which keeps "Set from camera"); the calibration panel does fine-tuning via nudge + yaw + opacity.

---

### Task 1: Pure calibration helpers (`calibration.ts`)

**Files:**
- Create: `frontend/src/panorama/domain/calibration.ts`
- Test (throwaway): `frontend/scripts/verify-calibration.mts`

**Interfaces:**
- Produces:
  - `interface CalibrationDraft { position: Vec3; yawOffset: number }`
  - `function nudgePosition(pos: Vec3, axis: "x" | "y" | "z", delta: number): Vec3`
  - `function clampOpacity(o: number): number`
  - `function applyCalibration(base: Panorama, draft: CalibrationDraft): Panorama`

- [ ] **Step 1: Write the failing test** — `frontend/scripts/verify-calibration.mts`

```ts
import {
  nudgePosition,
  clampOpacity,
  applyCalibration,
} from "../src/panorama/domain/calibration.ts";

const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;

const p0 = { x: 0, y: 0, z: 0 };
const p1 = nudgePosition(nudgePosition(p0, "x", 0.01), "x", 0.01);
const t1 = near(p1.x, 0.02) && near(p1.y, 0) && near(p1.z, 0);

const t2 = clampOpacity(0) === 0.15 && clampOpacity(2) === 1 && clampOpacity(0.5) === 0.5;

const base = {
  id: 1, territorySlug: "t", slug: "s", title: "x",
  sourceBlobHash: "h", position: { x: 9, y: 9, z: 9 }, yawOffset: 0, updatedAt: "",
};
const eff = applyCalibration(base, { position: { x: 1, y: 2, z: 3 }, yawOffset: 1.5 });
const t3 =
  eff.position.x === 1 && eff.position.z === 3 && eff.yawOffset === 1.5 &&
  eff.title === "x" && eff.sourceBlobHash === "h";

console.log("nudge", t1, "clamp", t2, "apply", t3);
process.exit(t1 && t2 && t3 ? 0 : 1);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types scripts/verify-calibration.mts`
Expected: FAIL — cannot find module `../src/panorama/domain/calibration.ts`.

- [ ] **Step 3: Write minimal implementation** — `frontend/src/panorama/domain/calibration.ts`

```ts
import type { Vec3 } from "@/shared/domain/vec3";
import type { Panorama } from "@/panorama/domain/panorama";

// Live, unsaved calibration values for the panorama being aligned.
export interface CalibrationDraft {
  position: Vec3;
  yawOffset: number;
}

const MIN_OPACITY = 0.15;
const MAX_OPACITY = 1;

// clampOpacity keeps the ghosted photo visible enough to align against
// while still letting the model show through.
export function clampOpacity(o: number): number {
  return Math.min(MAX_OPACITY, Math.max(MIN_OPACITY, o));
}

// nudgePosition returns a copy of pos with one axis shifted by delta.
export function nudgePosition(
  pos: Vec3,
  axis: "x" | "y" | "z",
  delta: number,
): Vec3 {
  return { ...pos, [axis]: pos[axis] + delta };
}

// applyCalibration overlays a draft (position + yaw) onto a panorama,
// producing the panorama as it should render while calibrating.
export function applyCalibration(
  base: Panorama,
  draft: CalibrationDraft,
): Panorama {
  return { ...base, position: draft.position, yawOffset: draft.yawOffset };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types scripts/verify-calibration.mts`
Expected: `nudge true clamp true apply true`, exit 0.

- [ ] **Step 5: Remove the throwaway script and commit**

```bash
rm frontend/scripts/verify-calibration.mts
git add frontend/src/panorama/domain/calibration.ts
git commit -m "feat(panorama): pure calibration helpers (nudge, clamp, overlay)"
```

---

### Task 2: Calibration hook (`use-panorama-calibration.ts`)

**Files:**
- Create: `frontend/src/panorama/application/use-panorama-calibration.ts`

**Interfaces:**
- Consumes: `applyCalibration`, `clampOpacity`, `nudgePosition`, `CalibrationDraft` from `@/panorama/domain/calibration`; `Panorama`; `Vec3`.
- Produces: `usePanoramaCalibration(editing: Panorama | null, onSave: (id: number, patch: { position: Vec3; yawOffset: number }) => void)` returning `{ calibrating, draft, opacity, effective, start, cancel, save, nudge, setYaw, setPosition, setOpacity }`.

- [ ] **Step 1: Create the hook** — `frontend/src/panorama/application/use-panorama-calibration.ts`

```ts
import { useCallback, useEffect, useState } from "react";
import type { Vec3 } from "@/shared/domain/vec3";
import type { Panorama } from "@/panorama/domain/panorama";
import {
  applyCalibration,
  clampOpacity,
  nudgePosition,
  type CalibrationDraft,
} from "@/panorama/domain/calibration";

const DEFAULT_OPACITY = 0.5;

// usePanoramaCalibration owns the overlay-calibration sub-mode for the
// panorama currently being edited. While calibrating, the sphere + camera
// render from an unsaved `draft` so adjustments are live; `save` persists
// the draft via the injected onSave. `effective` is the draft-overlaid
// panorama the scene should render (null when not calibrating).
export function usePanoramaCalibration(
  editing: Panorama | null,
  onSave: (id: number, patch: { position: Vec3; yawOffset: number }) => void,
) {
  const [calibrating, setCalibrating] = useState(false);
  const [draft, setDraft] = useState<CalibrationDraft | null>(null);
  const [opacity, setOpacityState] = useState(DEFAULT_OPACITY);

  // Calibration belongs to one panorama; switching the edit target (or
  // closing it) cancels an in-progress calibration so a stale draft never
  // applies to a different panorama.
  const editingId = editing?.id ?? null;
  useEffect(() => {
    setCalibrating(false);
    setDraft(null);
  }, [editingId]);

  const start = useCallback(() => {
    if (!editing) return;
    setDraft({ position: editing.position, yawOffset: editing.yawOffset });
    setCalibrating(true);
  }, [editing]);

  const cancel = useCallback(() => {
    setCalibrating(false);
    setDraft(null);
  }, []);

  const save = useCallback(() => {
    if (editing && draft) {
      onSave(editing.id, {
        position: draft.position,
        yawOffset: draft.yawOffset,
      });
    }
    setCalibrating(false);
    setDraft(null);
  }, [editing, draft, onSave]);

  const nudge = useCallback((axis: "x" | "y" | "z", delta: number) => {
    setDraft((d) =>
      d ? { ...d, position: nudgePosition(d.position, axis, delta) } : d,
    );
  }, []);

  const setYaw = useCallback((yawOffset: number) => {
    setDraft((d) => (d ? { ...d, yawOffset } : d));
  }, []);

  const setPosition = useCallback((position: Vec3) => {
    setDraft((d) => (d ? { ...d, position } : d));
  }, []);

  const setOpacity = useCallback(
    (o: number) => setOpacityState(clampOpacity(o)),
    [],
  );

  const effective =
    calibrating && editing && draft ? applyCalibration(editing, draft) : null;

  return {
    calibrating,
    draft,
    opacity,
    effective,
    start,
    cancel,
    save,
    nudge,
    setYaw,
    setPosition,
    setOpacity,
  };
}
```

- [ ] **Step 2: Type-check**

Run: `yarn build`
Expected: `Compiled successfully` + `Finished TypeScript`.

- [ ] **Step 3: Commit**

```bash
git add src/panorama/application/use-panorama-calibration.ts
git commit -m "feat(panorama): calibration hook with live draft + opacity"
```

---

### Task 3: Sphere opacity prop

**Files:**
- Modify: `frontend/src/panorama/presentation/three/panorama-sphere.tsx`

**Interfaces:**
- Produces: `PanoramaSphere` accepts an optional `opacity?: number` (default `1`).

- [ ] **Step 1: Add the prop to the interface**

In `interface PanoramaSphereProps`, after `meshRef: RefObject<Mesh | null>;` add:

```ts
  // < 1 ghosts the equirect over the model for overlay calibration.
  opacity?: number;
```

- [ ] **Step 2: Destructure with default**

Change the component signature:

```ts
export default function PanoramaSphere({ panorama, meshRef, opacity = 1 }: PanoramaSphereProps) {
```

- [ ] **Step 3: Apply opacity to the material**

Replace the `<meshBasicMaterial ... />` element with:

```tsx
      <meshBasicMaterial
        map={texture}
        side={BackSide}
        toneMapped={false}
        transparent={opacity < 1}
        opacity={opacity}
        depthTest={opacity >= 1}
        depthWrite={opacity >= 1}
      />
```

And add `renderOrder={opacity < 1 ? 1000 : 0}` to the wrapping `<mesh ...>` (so the ghosted photo draws over the opaque model).

- [ ] **Step 4: Build**

Run: `yarn build`
Expected: `Compiled successfully` (existing call sites still pass — `opacity` defaults to 1).

- [ ] **Step 5: Commit**

```bash
git add src/panorama/presentation/three/panorama-sphere.tsx
git commit -m "feat(panorama): sphere opacity prop for overlay calibration"
```

---

### Task 4: Rig follows live anchor nudges

**Files:**
- Modify: `frontend/src/panorama/presentation/three/panorama-rig.tsx`

**Interfaces:**
- `PanoramaRig` keeps its `{ panorama: Panorama }` prop; behaviour gains live follow.

- [ ] **Step 1: Replace the file** — `frontend/src/panorama/presentation/three/panorama-rig.tsx`

```tsx
import { useEffect, useRef } from "react";
import { useThree } from "@react-three/fiber";
import type { Camera } from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { Vec3 } from "@/shared/domain/vec3";
import type { Panorama } from "@/panorama/domain/panorama";

// enterPanorama locks the shared controls + camera at the anchor and
// returns a cleanup that restores the prior state. Lives outside the
// component so the hooks linter doesn't see the writes as modifying hook
// outputs.
function enterPanorama(
  controls: OrbitControlsImpl,
  camera: Camera,
  anchor: Vec3,
  invalidate: () => void,
): () => void {
  const prev = {
    enableZoom: controls.enableZoom,
    enablePan: controls.enablePan,
    target: controls.target.clone(),
    cameraPos: camera.position.clone(),
    minDist: controls.minDistance,
    maxDist: controls.maxDistance,
  };
  camera.position.set(anchor.x, anchor.y, anchor.z);
  controls.target.set(anchor.x, anchor.y, anchor.z + 0.01);
  controls.enableZoom = false;
  controls.enablePan = false;
  controls.minDistance = 0.005;
  controls.maxDistance = 0.02;
  controls.update();
  invalidate();
  return () => {
    camera.position.copy(prev.cameraPos);
    controls.target.copy(prev.target);
    controls.enableZoom = prev.enableZoom;
    controls.enablePan = prev.enablePan;
    controls.minDistance = prev.minDist;
    controls.maxDistance = prev.maxDist;
    controls.update();
    invalidate();
  };
}

interface PanoramaRigProps {
  panorama: Panorama;
}

// PanoramaRig hijacks the shared OrbitControls while a panorama is active.
// Entering teleports the camera to the anchor and disables zoom/pan
// (head-only camera). During overlay calibration the anchor position can
// change live; we then translate camera + target by the delta so the view
// follows the anchor WITHOUT resetting the look direction. Yaw never moves
// the camera (the sphere rotates instead). State restores on unmount.
export default function PanoramaRig({ panorama }: PanoramaRigProps) {
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);
  const controls = useThree((s) => s.controls as OrbitControlsImpl | null);
  const id = panorama.id;
  const pos = panorama.position;

  // useLatest: capture the current anchor without making it an enter dep,
  // so the enter/exit effect runs only when the panorama id changes.
  const posRef = useRef(pos);
  posRef.current = pos;
  const prevPos = useRef(pos);

  useEffect(() => {
    if (!controls) return;
    prevPos.current = posRef.current;
    return enterPanorama(controls, camera, posRef.current, invalidate);
  }, [camera, controls, invalidate, id]);

  useEffect(() => {
    if (!controls) return;
    const prev = prevPos.current;
    const dx = pos.x - prev.x;
    const dy = pos.y - prev.y;
    const dz = pos.z - prev.z;
    if (dx === 0 && dy === 0 && dz === 0) return;
    camera.position.x += dx;
    camera.position.y += dy;
    camera.position.z += dz;
    controls.target.x += dx;
    controls.target.y += dy;
    controls.target.z += dz;
    controls.update();
    invalidate();
    prevPos.current = { x: pos.x, y: pos.y, z: pos.z };
  }, [camera, controls, invalidate, pos.x, pos.y, pos.z]);

  return null;
}
```

- [ ] **Step 2: Build**

Run: `yarn build`
Expected: `Compiled successfully`.

- [ ] **Step 3: Commit**

```bash
git add src/panorama/presentation/three/panorama-rig.tsx
git commit -m "feat(panorama): rig follows live anchor nudges, keeping view"
```

---

### Task 5: Calibration controls panel

**Files:**
- Create: `frontend/src/panorama/presentation/components/panorama-calibration-panel.tsx`

**Interfaces:**
- Consumes: `Panorama`, `Vec3`, `CalibrationDraft` from `@/panorama/domain/calibration`.
- Produces: default-exported `PanoramaCalibrationPanel` with props
  `{ panorama: Panorama; draft: CalibrationDraft; opacity: number; onNudge: (axis: "x" | "y" | "z", delta: number) => void; onSetYaw: (rad: number) => void; onSetOpacity: (o: number) => void; onSave: () => void; onExit: () => void }`.

- [ ] **Step 1: Create the panel** — `frontend/src/panorama/presentation/components/panorama-calibration-panel.tsx`

```tsx
import { useState } from "react";
import type { Panorama } from "@/panorama/domain/panorama";
import type { CalibrationDraft } from "@/panorama/domain/calibration";

interface PanoramaCalibrationPanelProps {
  panorama: Panorama;
  draft: CalibrationDraft;
  opacity: number;
  onNudge: (axis: "x" | "y" | "z", delta: number) => void;
  onSetYaw: (rad: number) => void;
  onSetOpacity: (o: number) => void;
  onSave: () => void;
  onExit: () => void;
}

const TAU = Math.PI * 2;
const RAD_TO_DEG = 180 / Math.PI;
const STEPS = [
  { label: "Fine", value: 0.005 },
  { label: "Med", value: 0.02 },
  { label: "Coarse", value: 0.1 },
];
const AXES: ("x" | "y" | "z")[] = ["x", "y", "z"];

// PanoramaCalibrationPanel fine-tunes a panorama against the ghosted photo
// overlay: photo opacity, per-axis anchor nudging at a chosen step, and yaw
// (slider + degrees). Coarse placement stays in the normal edit panel.
export default function PanoramaCalibrationPanel({
  panorama,
  draft,
  opacity,
  onNudge,
  onSetYaw,
  onSetOpacity,
  onSave,
  onExit,
}: PanoramaCalibrationPanelProps) {
  const [step, setStep] = useState(STEPS[0].value);
  const deg = Math.round(draft.yawOffset * RAD_TO_DEG);

  return (
    <div className="pointer-events-auto w-full rounded-xl border border-cyan-300/30 bg-black/60 p-3 shadow-xl backdrop-blur">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="truncate text-xs font-semibold uppercase tracking-wider text-cyan-300/90">
          Calibrate · {panorama.title}
        </h3>
        <button
          type="button"
          onClick={onExit}
          aria-label="Exit calibration"
          className="cursor-pointer text-neutral-400 transition-colors hover:text-white"
        >
          ×
        </button>
      </div>

      <label className="mb-3 block">
        <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-[0.18em] text-neutral-400">
          <span>Photo opacity</span>
          <span className="text-neutral-500">{Math.round(opacity * 100)}%</span>
        </div>
        <input
          type="range"
          min={0.15}
          max={1}
          step={0.05}
          value={opacity}
          onChange={(e) => onSetOpacity(Number.parseFloat(e.target.value))}
          className="w-full cursor-pointer accent-cyan-300"
        />
      </label>

      <div className="mb-3">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-[0.18em] text-neutral-400">
            Anchor nudge
          </span>
          <div className="flex gap-1">
            {STEPS.map((s) => (
              <button
                key={s.label}
                type="button"
                onClick={() => setStep(s.value)}
                className={`cursor-pointer rounded px-1.5 py-0.5 text-[10px] transition-colors ${
                  step === s.value
                    ? "bg-cyan-500/25 text-cyan-100"
                    : "bg-white/5 text-neutral-300 hover:bg-white/10"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-1">
          {AXES.map((axis) => (
            <div key={axis} className="flex items-center gap-2">
              <span className="w-4 text-[11px] uppercase text-neutral-400">
                {axis}
              </span>
              <button
                type="button"
                onClick={() => onNudge(axis, -step)}
                className="h-6 flex-1 cursor-pointer rounded border border-white/10 bg-white/[0.04] text-xs text-neutral-200 transition-colors hover:bg-white/10"
              >
                −
              </button>
              <span className="w-16 text-center text-[11px] tabular-nums text-neutral-300">
                {draft.position[axis].toFixed(3)}
              </span>
              <button
                type="button"
                onClick={() => onNudge(axis, step)}
                className="h-6 flex-1 cursor-pointer rounded border border-white/10 bg-white/[0.04] text-xs text-neutral-200 transition-colors hover:bg-white/10"
              >
                +
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="mb-3">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-[0.18em] text-neutral-400">
            Yaw
          </span>
          <input
            type="number"
            value={deg}
            onChange={(e) =>
              onSetYaw((Number.parseFloat(e.target.value) || 0) / RAD_TO_DEG)
            }
            className="w-16 rounded border border-white/10 bg-white/[0.04] px-1 py-0.5 text-right text-[11px] text-neutral-200"
          />
        </div>
        <input
          type="range"
          min={0}
          max={TAU}
          step={TAU / 360}
          value={draft.yawOffset}
          onChange={(e) => onSetYaw(Number.parseFloat(e.target.value))}
          className="w-full cursor-pointer accent-cyan-300"
        />
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onSave}
          className="flex-1 cursor-pointer rounded-md bg-cyan-300 px-2 py-1.5 text-xs font-semibold text-neutral-900 transition-colors hover:bg-cyan-200"
        >
          Save
        </button>
        <button
          type="button"
          onClick={onExit}
          className="cursor-pointer rounded-md border border-white/20 bg-transparent px-3 py-1.5 text-xs text-neutral-200 transition-colors hover:bg-white/[0.06]"
        >
          Exit
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build**

Run: `yarn build`
Expected: `Compiled successfully` (component compiles though not yet rendered).

- [ ] **Step 3: Commit**

```bash
git add src/panorama/presentation/components/panorama-calibration-panel.tsx
git commit -m "feat(panorama): calibration controls panel (opacity, nudge, yaw)"
```

---

### Task 6: Wire calibration into the viewer (integration)

**Files:**
- Modify: `frontend/src/viewer/presentation/three/scene-canvas.tsx`
- Modify: `frontend/src/viewer/presentation/components/model-viewer.tsx`
- Modify: `frontend/src/panorama/presentation/components/panorama-edit-panel.tsx`
- Modify: `frontend/src/panorama/presentation/components/panorama-section.tsx`

**Interfaces:**
- Consumes: `usePanoramaCalibration` (Task 2), `PanoramaCalibrationPanel` (Task 5), `PanoramaSphere.opacity` (Task 3).
- Produces: `SceneCanvas` gains `calibrating: boolean` + `panoramaOpacity: number`; `PanoramaEditPanel` gains `onCalibrate: () => void`; `PanoramaSection` gains a `calibration` prop (the `usePanoramaCalibration` return).

- [ ] **Step 1: SceneCanvas — add props**

In `interface SceneCanvasProps`, after `onActivatePanorama: (id: number) => void;` add:

```ts
  // Overlay-calibration: show the model under a ghosted, semi-transparent
  // panorama photo so the operator can align anchor + yaw.
  calibrating: boolean;
  panoramaOpacity: number;
```

Destructure them in the function params (after `onActivatePanorama,`):

```ts
  calibrating,
  panoramaOpacity,
```

- [ ] **Step 2: SceneCanvas — territory visibility + sphere opacity**

Change the territory wrapper group's `visible`:

```tsx
          <group visible={!activePanorama || calibrating}>
```

Pass opacity to the sphere:

```tsx
              <PanoramaSphere
                panorama={activePanorama}
                meshRef={panoramaRef}
                opacity={calibrating ? panoramaOpacity : 1}
              />
```

- [ ] **Step 3: model-viewer — compose the hook**

After the `const panorama = usePanoramaOrchestration(panoramas);` line, add the import at the top (with the other panorama imports):

```ts
import { usePanoramaCalibration } from "@/panorama/application/use-panorama-calibration";
```

and, after `const panorama = usePanoramaOrchestration(panoramas);`:

```ts
  const calibration = usePanoramaCalibration(
    panorama.editingPanorama,
    updatePanoramaState,
  );
```

- [ ] **Step 4: model-viewer — feed the scene**

In the `<SceneCanvas ... />`, change `activePanorama` and add the two props:

```tsx
        activePanorama={calibration.effective ?? panorama.activePanorama}
        panoramas={panoramas}
        onActivatePanorama={panorama.activate}
        calibrating={calibration.calibrating}
        panoramaOpacity={calibration.opacity}
```

- [ ] **Step 5: model-viewer — pass calibration to the section**

In the `<PanoramaSection ... />`, add:

```tsx
              calibration={calibration}
```

- [ ] **Step 6: PanoramaEditPanel — Calibrate button**

Add to `PanoramaEditPanelProps`:

```ts
  onCalibrate: () => void;
```

Destructure `onCalibrate` in the params. Then, inside the non-failed branch (`) : (` ... `<>`), immediately after the "Enter panorama view" toggle button's closing tag, add:

```tsx
          <button
            type="button"
            onClick={onCalibrate}
            className="mb-3 w-full cursor-pointer rounded-lg border border-cyan-300/40 bg-cyan-500/10 px-3 py-1.5 text-xs font-medium text-cyan-100 transition-colors hover:bg-cyan-500/20"
          >
            Calibrate (overlay)
          </button>
```

- [ ] **Step 7: PanoramaSection — render the calibration panel**

Add the imports:

```ts
import type { usePanoramaCalibration } from "@/panorama/application/use-panorama-calibration";
import PanoramaCalibrationPanel from "@/panorama/presentation/components/panorama-calibration-panel";
```

Add to `PanoramaSectionProps`:

```ts
  calibration: ReturnType<typeof usePanoramaCalibration>;
```

Destructure `calibration` in the params. Then replace the trailing `{editingPanorama ? ( ... ) : null}` block with:

```tsx
      {editingPanorama && calibration.calibrating && calibration.draft ? (
        <PanoramaCalibrationPanel
          panorama={editingPanorama}
          draft={calibration.draft}
          opacity={calibration.opacity}
          onNudge={calibration.nudge}
          onSetYaw={calibration.setYaw}
          onSetOpacity={calibration.setOpacity}
          onSave={calibration.save}
          onExit={calibration.cancel}
        />
      ) : editingPanorama ? (
        <PanoramaEditPanel
          key={editingPanorama.id}
          panorama={editingPanorama}
          cameraPositionRef={cameraPositionRef}
          inPanoramaMode={inPanoramaMode}
          failed={failedPanoramaIds.has(editingPanorama.id)}
          onSave={(patch) => onSavePanorama(editingPanorama.id, patch)}
          onToggleView={toggleView}
          onClose={closeEdit}
          onDelete={() => onDeletePanorama(editingPanorama.id)}
          onCalibrate={calibration.start}
        />
      ) : null}
```

- [ ] **Step 8: Lint and build**

Run: `yarn lint && yarn build`
Expected: lint `Done` (no errors/warnings); build `Compiled successfully` + `Finished TypeScript`.

- [ ] **Step 9: Commit**

```bash
git add src/viewer/presentation/three/scene-canvas.tsx \
        src/viewer/presentation/components/model-viewer.tsx \
        src/panorama/presentation/components/panorama-edit-panel.tsx \
        src/panorama/presentation/components/panorama-section.tsx
git commit -m "feat(panorama): overlay calibration mode wired into the viewer"
```

- [ ] **Step 10: Manual verification (operator)**

Deploy. Open a panorama → edit panel → "Calibrate (overlay)". Expect: the 3D model becomes visible with the photo ghosted over it, camera at the anchor (rotate to look). Drag the opacity slider; nudge X/Y/Z at Fine/Med/Coarse — the photo + camera follow the anchor without resetting the view; adjust Yaw (slider/degrees) — the photo rotates over the model. Align a recognizable feature/placement, Save. Re-enter the panorama and confirm the placed object now sits correctly against the photo. Exit discards an unsaved draft.

---

## Self-Review

**Spec coverage:**
- Overlay: model visible + ghosted photo → Task 3 (sphere opacity) + Task 6 Steps 2/4 (territory visible, opacity fed). ✓
- Camera at anchor + rotate, live follow preserving direction → Task 4 (rig). ✓
- Live draft drives sphere/camera; Save persists → Task 2 (hook `effective`/`save`) + Task 6 Step 4 (`effective` fed as activePanorama). ✓
- Controls: opacity slider, per-axis nudge with step, yaw slider + degrees → Task 5 (panel). ✓
- Entry via edit panel button → Task 6 Step 6. ✓
- Calibration panel replaces edit panel while calibrating → Task 6 Step 7. ✓
- Opacity clamp 0.15–1 → Task 1 `clampOpacity`. ✓
- Switching/closing edit target cancels calibration → Task 2 effect on `editingId`. ✓
- Placements stay visible (always rendered, not gated) → unchanged behaviour. ✓
- Save via existing optimistic `updatePanorama` → Task 6 Step 3 passes `updatePanoramaState`. ✓
- Markers hidden in calibration → `activePanorama` non-null (effective) keeps the existing `!activePanorama` gate off. ✓
- Pure-logic tests → Task 1 verify script. ✓
- **Deviation:** "Set from camera" omitted from the calibration panel (no-op when camera = anchor); flagged in File Structure note. Coarse placement remains in the normal edit panel.

**Placeholder scan:** none — every step has full code/commands.

**Type consistency:** `usePanoramaCalibration(editing, onSave)` returns `{ calibrating, draft, opacity, effective, start, cancel, save, nudge, setYaw, setPosition, setOpacity }`; `PanoramaSection` consumes them via `ReturnType<typeof usePanoramaCalibration>`; `PanoramaCalibrationPanel` props match the handlers passed (`onNudge=nudge`, `onSetYaw=setYaw`, `onSetOpacity=setOpacity`, `onSave=save`, `onExit=cancel`). `CalibrationDraft { position: Vec3; yawOffset: number }` used consistently. `applyCalibration(base, draft): Panorama` feeds `SceneCanvas.activePanorama: Panorama | null`. `PanoramaSphere.opacity?: number` matches `opacity={calibrating ? panoramaOpacity : 1}`. `setPosition` is exposed by the hook for completeness though the panel uses `nudge`/`setYaw` (no unused-prop error — it's a hook return, not a required prop). ✓
