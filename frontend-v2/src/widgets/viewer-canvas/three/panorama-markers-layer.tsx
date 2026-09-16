import type { Panorama } from "@/entities/panorama";
import type { Vec3 } from "@/entities/placement";
import PanoramaMarker from "./panorama-marker";

interface PanoramaMarkersLayerProps {
  panoramas: Panorama[];
  onActivate: (id: number) => void;
  moveMode?: boolean;
  /**
   * The capture being calibrated: its anchor is NOT drawn. The rig pins the
   * camera onto it, so its marker projects onto the eye and lands in the
   * corner of the viewport; the nudge row and `Set from camera` are what move
   * it. The rest are drawn for reference. Null outside calibration.
   */
  editingId?: number | null;
  draggingId?: number | null;
  livePos?: Vec3 | null;
  onGrab?: (id: number) => void;
}

// PanoramaMarkersLayer draws an anchor marker for every panorama. The caller
// gates the mount to the 3D view — inside a panorama the reader is standing at
// one of these anchors, and while picking points the markers would eat clicks.
export default function PanoramaMarkersLayer({
  panoramas,
  onActivate,
  moveMode = false,
  editingId = null,
  draggingId = null,
  livePos = null,
  onGrab,
}: PanoramaMarkersLayerProps) {
  return (
    <>
      {panoramas
        .filter((p) => p.id !== editingId)
        .map((p) => (
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
