import type { Panorama } from "@/panorama/domain/panorama";
import PanoramaMarker from "@/panorama/presentation/three/panorama-marker";

interface PanoramaMarkersLayerProps {
  panoramas: Panorama[];
  onActivate: (id: number) => void;
}

// PanoramaMarkersLayer renders a camera-facing marker at every panorama's
// anchor. The parent gates mounting to the 3D scene view (not inside a
// panorama, not in measure mode).
export default function PanoramaMarkersLayer({
  panoramas,
  onActivate,
}: PanoramaMarkersLayerProps) {
  return (
    <>
      {panoramas.map((p) => (
        <PanoramaMarker key={p.id} panorama={p} onActivate={onActivate} />
      ))}
    </>
  );
}
