import { useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import PanoramaLoadingBar from "@/panorama/presentation/components/panorama-loading-bar";

// Full-canvas cover shown while the equirect streams in, so switching from the
// 3D view isn't a blank wait.
//
// Deliberately NOT drei's `fullscreen` prop: that anchors the element to the
// projected screen position of the Html group — here the world origin — and
// then offsets by half the canvas. It only covers the canvas when the origin
// happens to project to the exact centre, which stops being true as soon as
// <Bounds fit> frames a model that isn't centred on the origin, or the user
// orbits. The overlay then slides off by the projection delta and leaves the
// viewer UI showing through along two edges.
//
// calculatePosition pins it to the canvas top-left instead, with an explicit
// size — no dependency on where the camera is looking.
const TOP_LEFT = (): [number, number] => [0, 0];

interface PanoramaLoadingOverlayProps {
  // 0–100, or null for indeterminate (server sent no Content-Length).
  progress: number | null;
}

export default function PanoramaLoadingOverlay({ progress }: PanoramaLoadingOverlayProps) {
  const size = useThree((s) => s.size);

  return (
    <Html calculatePosition={TOP_LEFT} style={{ width: size.width, height: size.height }}>
      <div className="flex h-full w-full items-center justify-center bg-black">
        <PanoramaLoadingBar progress={progress} />
      </div>
    </Html>
  );
}
