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
