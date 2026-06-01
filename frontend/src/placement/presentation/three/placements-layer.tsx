import { type RefObject, useCallback, useEffect, useRef, useState } from "react";
import type { Group, Object3D } from "three";
import { useThree } from "@react-three/fiber";
import { TransformControls } from "@react-three/drei";
import type {
  OrbitControls as OrbitControlsImpl,
  TransformControls as TransformControlsImpl,
} from "three-stdlib";
import type { GizmoMode } from "@/placement/domain/gizmo-mode";
import type {
  PlacementTransform,
  ResolvedPlacement,
} from "@/placement/domain/placement";
import PlacementInstance from "@/placement/presentation/three/placement-instance";
import { raycastSurfaceY } from "@/placement/application/snap-to-surface";

interface PlacementsLayerProps {
  placements: ResolvedPlacement[];
  selectedId: number | null;
  mode: GizmoMode;
  measureMode: boolean;
  // The territory's outermost group. When present, translate-mode drags
  // resolve the surface Y under the gizmo and either snap to it (snap on)
  // or use it as a floor (snap off — prevents burying the model).
  territoryRef: RefObject<Object3D | null>;
  snapEnabled: boolean;
  onSelect: (id: number | null) => void;
  onCommit: (id: number, transform: PlacementTransform) => void;
}

interface DraggingChangedEvent {
  value: boolean;
}

// three's TransformControls fires "dragging-changed", but Object3DEventMap
// doesn't list it, so the strongly-typed addEventListener rejects the
// string. Narrow local view onto the event API gives back the right type
// without leaking `any` outward.
type DraggingChangedListener = (event: DraggingChangedEvent) => void;
type ObjectChangeListener = () => void;
interface TransformEmitter {
  addEventListener(type: "dragging-changed", listener: DraggingChangedListener): void;
  removeEventListener(type: "dragging-changed", listener: DraggingChangedListener): void;
  addEventListener(type: "objectChange", listener: ObjectChangeListener): void;
  removeEventListener(type: "objectChange", listener: ObjectChangeListener): void;
}

function asEmitter(tc: TransformControlsImpl): TransformEmitter {
  return tc as unknown as TransformEmitter;
}

// three-stdlib's TransformControls keeps its handle groups under
// `gizmo` (a TransformControlsGizmo whose own `gizmo` and `picker`
// dictionaries hold the per-mode groups). Scale mode in this fork has
// no single central XYZ cube — it ships three uniform-scale cubes
// named `XYZX` / `XYZY` / `XYZZ` at the tips of each axis. We keep
// just one (`XYZX`) so the user sees a single grabbable handle.
interface ScaleGizmo {
  gizmo: {
    gizmo: { scale: Group };
    picker: { scale: Group };
    updateMatrixWorld: (force?: boolean) => void;
  };
}

function scaleHandles(tc: TransformControlsImpl): Object3D[] {
  const g = tc as unknown as ScaleGizmo;
  return [...g.gizmo.gizmo.scale.children, ...g.gizmo.picker.scale.children];
}

// PlacementsLayer renders every placement and, when one is selected,
// attaches the gizmo. The transform write path is imperative — TC mutates
// the Object3D directly during a drag, so we read it back on
// dragging-changed→false and dispatch a commit. OrbitControls is disabled
// for the duration of the drag through the same event.
export default function PlacementsLayer({
  placements,
  selectedId,
  mode,
  measureMode,
  territoryRef,
  snapEnabled,
  onSelect,
  onCommit,
}: PlacementsLayerProps) {
  const [target, setTarget] = useState<Object3D | null>(null);
  const tcRef = useRef<TransformControlsImpl | null>(null);
  const orbit = useThree(
    (state) => state.controls as OrbitControlsImpl | null,
  );
  const invalidate = useThree((state) => state.invalidate);

  // Apply surface logic in-place on the gizmo target. Two modes:
  //   snap on  → set Y to the resolved surface (object hugs terrain).
  //   snap off → use surface as a floor (object can hover, never bury).
  // Returns true if any write happened, so callers can decide whether to
  // request a re-render under frameloop="demand".
  const applySurface = useCallback(() => {
    const obj = target;
    const territory = territoryRef.current;
    if (!obj || !territory || mode !== "translate") return false;
    const surfaceY = raycastSurfaceY(territory, obj.position.x, obj.position.z);
    if (surfaceY == null) return false;
    if (snapEnabled) {
      if (obj.position.y === surfaceY) return false;
      obj.position.y = surfaceY;
      return true;
    }
    if (obj.position.y < surfaceY) {
      obj.position.y = surfaceY;
      return true;
    }
    return false;
  }, [target, territoryRef, mode, snapEnabled]);

  const commitFromTarget = useCallback(() => {
    const obj = target;
    if (!obj || selectedId == null) return;
    // Final pass: ensure the committed transform matches whatever the
    // user sees (surface-clamped) even if the last objectChange tick was
    // ahead of the most recent raycast.
    applySurface();
    onCommit(selectedId, {
      position: { x: obj.position.x, y: obj.position.y, z: obj.position.z },
      rotation: { x: obj.rotation.x, y: obj.rotation.y, z: obj.rotation.z },
      scale: { x: obj.scale.x, y: obj.scale.y, z: obj.scale.z },
    });
  }, [applySurface, onCommit, selectedId, target]);

  useEffect(() => {
    const tc = tcRef.current;
    if (!tc || !orbit) return;
    const emitter = asEmitter(tc);
    const lastScale = { v: 1 };
    const onChange: DraggingChangedListener = (event) => {
      orbit.enabled = !event.value;
      if (event.value && target) lastScale.v = target.scale.x;
      if (!event.value) commitFromTarget();
    };
    // In scale mode, force uniform scaling: detect the axis the user
    // dragged and propagate to the other two. Source models are already
    // correctly proportioned, so per-axis scale would only distort them.
    const onObjectChange: ObjectChangeListener = () => {
      if (mode === "translate" && target) {
        // Snap (or floor) the gizmo target every drag tick. Cheap: one
        // downward ray against the territory mesh, regardless of triangle
        // count. invalidate() repaints under frameloop="demand"; without
        // it the snapped Y wouldn't be visible until the next R3F event.
        if (applySurface()) invalidate();
      }
      if (mode !== "scale" || !target) return;
      const s = target.scale;
      const prev = lastScale.v;
      const dx = Math.abs(s.x - prev);
      const dy = Math.abs(s.y - prev);
      const dz = Math.abs(s.z - prev);
      let next = dx >= dy && dx >= dz ? s.x : dy >= dz ? s.y : s.z;
      // three-stdlib's scale math flips sign when the drag crosses
      // the gizmo origin — clamp to a small positive floor so users
      // can't accidentally invert the model.
      if (next < 0.01) next = 0.01;
      if (s.x !== next || s.y !== next || s.z !== next) {
        s.set(next, next, next);
      }
      lastScale.v = next;
    };
    emitter.addEventListener("dragging-changed", onChange);
    emitter.addEventListener("objectChange", onObjectChange);
    return () => {
      emitter.removeEventListener("dragging-changed", onChange);
      emitter.removeEventListener("objectChange", onObjectChange);
    };
  }, [orbit, commitFromTarget, mode, target, applySurface, invalidate]);

  // Monkey-patch the internal gizmo so only the central uniform-XYZ cube
  // is visible / pickable in scale mode. three's TransformControlsGizmo
  // resets handle.visible every frame inside its own updateMatrixWorld,
  // so a one-shot set via useEffect doesn't stick — we wrap that method
  // and re-apply the hide rule after the original runs.
  useEffect(() => {
    const tc = tcRef.current;
    if (!tc) return;
    const gizmo = (tc as unknown as ScaleGizmo).gizmo;
    const original = gizmo.updateMatrixWorld;
    gizmo.updateMatrixWorld = function patched(force) {
      original.call(this, force);
      if (tc.getMode() !== "scale") return;
      for (const h of scaleHandles(tc)) {
        if (h.name !== "XYZX") h.visible = false;
      }
    };
    return () => {
      gizmo.updateMatrixWorld = original;
    };
  }, [target]);

  return (
    <>
      {placements.map((p) => (
        <PlacementInstance
          key={p.id}
          // Only the selected instance forwards its ref to the gizmo —
          // setTarget (a useState setter) keeps a stable identity, so memo
          // on PlacementInstance can shallow-skip non-selected ones.
          ref={p.id === selectedId ? setTarget : null}
          placement={p}
          selected={p.id === selectedId}
          measureMode={measureMode}
          onSelect={onSelect}
        />
      ))}
      {/* In measure mode the gizmo is hidden — the user is picking points,
          not editing the placement. The selection survives the mode switch
          so coming back to translate/rotate/scale finds the same target. */}
      {!measureMode && selectedId != null && target ? (
        <TransformControls ref={tcRef} object={target} mode={mode} size={0.85} />
      ) : null}
    </>
  );
}
