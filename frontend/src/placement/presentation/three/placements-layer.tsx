import { useCallback, useEffect, useRef, useState } from "react";
import type { Object3D } from "three";
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

interface PlacementsLayerProps {
  placements: ResolvedPlacement[];
  selectedId: number | null;
  mode: GizmoMode;
  measureMode: boolean;
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
interface DraggingChangedEmitter {
  addEventListener(type: "dragging-changed", listener: DraggingChangedListener): void;
  removeEventListener(type: "dragging-changed", listener: DraggingChangedListener): void;
}

function asEmitter(tc: TransformControlsImpl): DraggingChangedEmitter {
  return tc as unknown as DraggingChangedEmitter;
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
  onSelect,
  onCommit,
}: PlacementsLayerProps) {
  const [target, setTarget] = useState<Object3D | null>(null);
  const tcRef = useRef<TransformControlsImpl | null>(null);
  const orbit = useThree(
    (state) => state.controls as OrbitControlsImpl | null,
  );

  const commitFromTarget = useCallback(() => {
    const obj = target;
    if (!obj || selectedId == null) return;
    onCommit(selectedId, {
      position: { x: obj.position.x, y: obj.position.y, z: obj.position.z },
      rotation: { x: obj.rotation.x, y: obj.rotation.y, z: obj.rotation.z },
      scale: { x: obj.scale.x, y: obj.scale.y, z: obj.scale.z },
    });
  }, [onCommit, selectedId, target]);

  useEffect(() => {
    const tc = tcRef.current;
    if (!tc || !orbit) return;
    const emitter = asEmitter(tc);
    const onChange: DraggingChangedListener = (event) => {
      orbit.enabled = !event.value;
      if (!event.value) commitFromTarget();
    };
    emitter.addEventListener("dragging-changed", onChange);
    return () => {
      emitter.removeEventListener("dragging-changed", onChange);
    };
  }, [orbit, commitFromTarget]);

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
