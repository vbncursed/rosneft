import type { Panorama } from "@/entities/panorama";
import type { Vec3 } from "@/entities/placement";
import PanoramaMarker from "./panorama-marker";

interface PanoramaMarkersLayerProps {
  panoramas: Panorama[];
  onActivate: (id: number) => void;
  moveMode?: boolean;
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
