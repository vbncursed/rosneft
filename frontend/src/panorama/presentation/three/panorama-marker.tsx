import { useCallback, useState } from "react";
import { Billboard, Html } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import type { Panorama } from "@/panorama/domain/panorama";

interface PanoramaMarkerProps {
  panorama: Panorama;
  onActivate: (id: number) => void;
}

// Visible dot, plus a larger invisible sphere as a comfortable click/hover
// target. depthTest off + high renderOrder draws the dot over scene
// geometry, matching the measurement-overlay convention.
const DOT_RADIUS = 0.03;
const HIT_RADIUS = 0.08;
const RENDER_ORDER = 999;
const DOT_COLOR = "#67e8f9";

// PanoramaMarker is a camera-facing dot at a panorama's anchor. Hover
// reveals the title; click enters that panorama. stopPropagation keeps the
// canvas-level deselect (onPointerMissed) from also firing.
export default function PanoramaMarker({
  panorama,
  onActivate,
}: PanoramaMarkerProps) {
  const [hovered, setHovered] = useState(false);

  const handleOver = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    setHovered(true);
    document.body.style.cursor = "pointer";
  }, []);

  const handleOut = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    setHovered(false);
    document.body.style.cursor = "";
  }, []);

  const handleClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      onActivate(panorama.id);
    },
    [onActivate, panorama.id],
  );

  const { x, y, z } = panorama.position;

  return (
    <Billboard position={[x, y, z]}>
      <mesh onPointerOver={handleOver} onPointerOut={handleOut} onClick={handleClick}>
        <sphereGeometry args={[HIT_RADIUS, 16, 16]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <mesh renderOrder={RENDER_ORDER}>
        <circleGeometry args={[DOT_RADIUS, 24]} />
        <meshBasicMaterial color={DOT_COLOR} depthTest={false} depthWrite={false} transparent />
      </mesh>
      {hovered && (
        <Html
          center
          zIndexRange={[20, 10]}
          style={{ transform: "translate(-50%, calc(-100% - 14px))" }}
        >
          <div className="pointer-events-none select-none whitespace-nowrap rounded-md border border-cyan-300/40 bg-black/80 px-2 py-0.5 text-[10px] font-medium leading-tight text-cyan-100 shadow-md backdrop-blur-sm">
            {panorama.title}
          </div>
        </Html>
      )}
    </Billboard>
  );
}
