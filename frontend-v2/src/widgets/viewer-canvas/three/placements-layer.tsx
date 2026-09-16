import { type RefObject, useEffect, useRef, useState } from "react";
import type { Object3D } from "three";
import { TransformControls } from "@react-three/drei";
import type { TransformControls as TransformControlsImpl } from "three-stdlib";
import type { GizmoMode } from "@/features/viewer-mode";
import { isVisibleIn, type PlacementTransform, type ResolvedPlacement } from "@/entities/placement";
import PlacementInstance from "./placement-instance";
import PlacementMarkers from "./placement-markers";
import { useGizmoEvents } from "./use-gizmo-events";
import { patchScaleGizmo } from "./scale-gizmo-patch";

interface PlacementsLayerProps {
  placements: ResolvedPlacement[];
  selectedId: number | null;
  mode: GizmoMode;
  // True whenever the canvas is picking points rather than editing — the
  // caller computes it as `mode !== "orbit"`.
  measureMode: boolean;
  // Gates the transform gizmo: a user without placement:write can still
  // select an object (to highlight it) but gets no gizmo to move it.
  canEdit: boolean;
  // The territory's outermost group. When present, translate-mode drags
  // resolve the surface Y under the gizmo and either snap to it (snap on)
  // or use it as a floor (snap off — prevents burying the model).
  territoryRef: RefObject<Object3D | null>;
  snapEnabled: boolean;
  // The panorama being looked at, or null for the 3D view. Inside a panorama a
  // placement renders only if its allowlist names that panorama — equipment
  // dropped for one panorama must not leak into the others. The 3D view always
  // shows every placement, so the editor can never lose one.
  activePanoramaId: number | null;
  /** `storage-tank-500 #1` by id, for the labels inside a panorama. */
  markerLabels: Record<number, string>;
  showMarkers: boolean;
  /** The anchors are being aligned: the object rings would sit over the one being dragged. */
  calibrating: boolean;
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
  activePanoramaId,
  markerLabels,
  showMarkers,
  calibrating,
  onSelect,
  onCommit,
}: PlacementsLayerProps) {
  const [target, setTarget] = useState<Object3D | null>(null);
  const tcRef = useRef<TransformControlsImpl | null>(null);

  useGizmoEvents({ tcRef, target, selectedId, mode, territoryRef, snapEnabled, onCommit });

  // Monkey-patch the gizmo so only the central uniform-XYZ cube is
  // visible in scale mode. Re-runs when `target` changes (the gizmo
  // mounts at that point with a fresh internal state).
  useEffect(() => {
    const tc = tcRef.current;
    if (!tc) return;
    return patchScaleGizmo(tc);
  }, [target]);

  const visible = placements.filter((p) => isVisibleIn(p, activePanoramaId));

  return (
    <>
      {visible.map((p) => (
        <PlacementInstance
          key={p.id}
          // Only the selected instance forwards its ref to the gizmo —
          // setTarget (a useState setter) keeps a stable identity, so memo
          // on PlacementInstance can shallow-skip non-selected ones.
          ref={p.id === selectedId ? setTarget : null}
          placement={p}
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
      {/* A panorama has no panel and no gizmo, so the ring and its name are
          the whole affordance. The 3D view names nothing — the labels would
          crowd a scene that already has the object list beside it. */}
      {activePanoramaId !== null && showMarkers && !calibrating ? (
        <PlacementMarkers placements={visible} labels={markerLabels} />
      ) : null}
    </>
  );
}
