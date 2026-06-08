import { type RefObject, useCallback, useEffect, useRef } from "react";
import type { Object3D } from "three";
import { useThree } from "@react-three/fiber";
import type {
  OrbitControls as OrbitControlsImpl,
  TransformControls as TransformControlsImpl,
} from "three-stdlib";
import type { GizmoMode } from "@/placement/domain/gizmo-mode";
import type { PlacementTransform } from "@/placement/domain/placement";
import { applySurface } from "@/placement/application/snap-translate";

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

interface UseGizmoEventsParams {
  tcRef: RefObject<TransformControlsImpl | null>;
  target: Object3D | null;
  selectedId: number | null;
  mode: GizmoMode;
  territoryRef: RefObject<Object3D | null>;
  snapEnabled: boolean;
  onCommit: (id: number, transform: PlacementTransform) => void;
}

// useGizmoEvents wires the three TransformControls events into:
//   • OrbitControls suspension during a drag
//   • surface snap/floor on each translate tick
//   • uniform scale clamp + positive-floor in scale mode
//   • commit on drag end (single, definitive PUT)
//
// The hook is intentionally side-effect-only — render output stays in
// PlacementsLayer, which simply attaches <TransformControls ref={tcRef}>.
export function useGizmoEvents(params: UseGizmoEventsParams) {
  const { tcRef, target, selectedId, mode, territoryRef, snapEnabled, onCommit } =
    params;
  const orbit = useThree(
    (state) => state.controls as OrbitControlsImpl | null,
  );
  const invalidate = useThree((state) => state.invalidate);

  // Apply the surface contract in-place. mode-gated here so non-translate
  // ticks short-circuit before touching the raycaster.
  const snapTick = useCallback((): boolean => {
    const obj = target;
    const territory = territoryRef.current;
    if (!obj || !territory || mode !== "translate") return false;
    return applySurface(obj, territory, snapEnabled);
  }, [target, territoryRef, mode, snapEnabled]);

  const commitFromTarget = useCallback(() => {
    const obj = target;
    if (!obj || selectedId == null) return;
    // Final pass: ensure the committed transform matches whatever the
    // user sees (surface-clamped) even if the last objectChange tick was
    // ahead of the most recent raycast.
    snapTick();
    onCommit(selectedId, {
      position: { x: obj.position.x, y: obj.position.y, z: obj.position.z },
      rotation: { x: obj.rotation.x, y: obj.rotation.y, z: obj.rotation.z },
      scale: { x: obj.scale.x, y: obj.scale.y, z: obj.scale.z },
    });
  }, [snapTick, onCommit, selectedId, target]);

  // Cache the previous uniform scale across renders so the same hook
  // instance can detect which axis the user dragged this tick.
  const lastScaleRef = useRef(1);

  useEffect(() => {
    const tc = tcRef.current;
    if (!tc || !orbit) return;
    const emitter = asEmitter(tc);
    const onDragChange: DraggingChangedListener = (event) => {
      orbit.enabled = !event.value;
      if (event.value && target) lastScaleRef.current = target.scale.x;
      if (!event.value) commitFromTarget();
    };
    const onObjectChange: ObjectChangeListener = () => {
      if (mode === "translate" && target) {
        // invalidate() repaints under frameloop="demand"; without it the
        // snapped Y wouldn't be visible until the next R3F event.
        if (snapTick()) invalidate();
      }
      if (mode !== "scale" || !target) return;
      const s = target.scale;
      const prev = lastScaleRef.current;
      const dx = Math.abs(s.x - prev);
      const dy = Math.abs(s.y - prev);
      const dz = Math.abs(s.z - prev);
      let next = dx >= dy && dx >= dz ? s.x : dy >= dz ? s.y : s.z;
      // three-stdlib's scale math flips sign when the drag crosses the
      // gizmo origin — clamp to a small positive floor.
      if (next < 0.01) next = 0.01;
      if (s.x !== next || s.y !== next || s.z !== next) {
        s.set(next, next, next);
      }
      lastScaleRef.current = next;
    };
    emitter.addEventListener("dragging-changed", onDragChange);
    emitter.addEventListener("objectChange", onObjectChange);
    return () => {
      emitter.removeEventListener("dragging-changed", onDragChange);
      emitter.removeEventListener("objectChange", onObjectChange);
    };
  }, [tcRef, orbit, commitFromTarget, mode, target, snapTick, invalidate]);
}
