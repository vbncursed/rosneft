import type { Panorama } from "@/entities/panorama";
import type { Vec3 } from "@/entities/placement";
import PanoramaMarker from "./panorama-marker";

interface PanoramaMarkersLayerProps {
  panoramas: Panorama[];
  onActivate: (id: number) => void;
  moveMode?: boolean;
  /**
   * The capture being calibrated. It is the only one a grab may move while the
   * alignment is open, and the only one drawn in the calibration look; the
   * rest are reference. Null outside calibration, where `moveMode` speaks for
   * every marker at once.
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
      {panoramas.map((p) => (
        <PanoramaMarker
          key={p.id}
          panorama={p}
          onActivate={onActivate}
          moveMode={moveMode && (editingId === null || p.id === editingId)}
          calibrating={p.id === editingId}
          dragging={draggingId === p.id}
          livePos={livePos}
          onGrab={onGrab}
        />
      ))}
    </>
  );
}
