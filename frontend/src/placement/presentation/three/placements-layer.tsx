import { type RefObject, useEffect, useRef, useState } from "react";
import type { Object3D } from "three";
import { TransformControls } from "@react-three/drei";
import type { TransformControls as TransformControlsImpl } from "three-stdlib";
import type { GizmoMode } from "@/placement/domain/gizmo-mode";
import type {
  PlacementTransform,
  ResolvedPlacement,
} from "@/placement/domain/placement";
import PlacementInstance from "@/placement/presentation/three/placement-instance";
import { useGizmoEvents } from "@/placement/application/use-gizmo-events";
import { patchScaleGizmo } from "@/placement/presentation/three/scale-gizmo-patch";

interface PlacementsLayerProps {
  placements: ResolvedPlacement[];
  selectedId: number | null;
  mode: GizmoMode;
  measureMode: boolean;
  // Gates the transform gizmo: a user without placement:write can still
  // select an object (to highlight it) but gets no gizmo to move it.
  canEdit: boolean;
  // The territory's outermost group. When present, translate-mode drags
  // resolve the surface Y under the gizmo and either snap to it (snap on)
  // or use it as a floor (snap off — prevents burying the model).
  territoryRef: RefObject<Object3D | null>;
  snapEnabled: boolean;
  onSelect: (id: number | null) => void;
  onCommit: (id: number, transform: PlacementTransform) => void;
}

// PlacementsLayer renders every placement and, when one is selected,
// attaches the gizmo. The transform write path is imperative — TC mutates
// the Object3D directly during a drag, so we read it back on
// dragging-changed→false and dispatch a commit (see useGizmoEvents).
export default function PlacementsLayer({
  placements,
  selectedId,
  mode,
  measureMode,
  canEdit,
  territoryRef,
  snapEnabled,
  onSelect,
  onCommit,
}: PlacementsLayerProps) {
  const [target, setTarget] = useState<Object3D | null>(null);
  const tcRef = useRef<TransformControlsImpl | null>(null);

  useGizmoEvents({
    tcRef,
    target,
    selectedId,
    mode,
    territoryRef,
    snapEnabled,
    onCommit,
  });

  // Monkey-patch the gizmo so only the central uniform-XYZ cube is
  // visible in scale mode. Re-runs when `target` changes (the gizmo
  // mounts at that point with a fresh internal state).
  useEffect(() => {
    const tc = tcRef.current;
    if (!tc) return;
    return patchScaleGizmo(tc);
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
      {canEdit && !measureMode && selectedId != null && target ? (
        <TransformControls ref={tcRef} object={target} mode={mode} size={0.85} />
      ) : null}
    </>
  );
}
