import { useState } from "react";
import { Html } from "@react-three/drei";
import type { Panorama } from "@/panorama/domain/panorama";
import type { Vec3 } from "@/shared/domain/vec3";

interface PanoramaMarkerProps {
  panorama: Panorama;
  onActivate: (id: number) => void;
  // Move-mode drag (all optional; default = today's click-to-enter behavior).
  moveMode?: boolean;
  dragging?: boolean;
  livePos?: Vec3 | null;
  onGrab?: (id: number) => void;
}

// PanoramaMarker is a glass "beacon" at a panorama's anchor: a glowing cyan
// core with a soft halo and a gentle pulse, matching the app's cyan/glass
// system (same tokens as the measurement chips). Rendered via drei <Html>
// so it stays a constant screen size, always draws over the scene, and
// clicks through the DOM rather than the raycaster. Hovering reveals the
// title; clicking enters that panorama. The pulse is motion-safe only, so
// it respects prefers-reduced-motion.
export default function PanoramaMarker({
  panorama,
  onActivate,
  moveMode = false,
  dragging = false,
  livePos = null,
  onGrab,
}: PanoramaMarkerProps) {
  const [hovered, setHovered] = useState(false);
  // While this marker is being dragged, render it at the live surface point
  // so it tracks the cursor; otherwise at its saved anchor.
  const pos = dragging && livePos ? livePos : panorama.position;
  const { x, y, z } = pos;

  return (
    <Html position={[x, y, z]} center zIndexRange={[20, 10]}>
      <div className="relative">
        <div
          className={`pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md border border-cyan-300/40 bg-black/80 px-2 py-0.5 text-[10px] font-medium leading-tight text-cyan-100 shadow-md backdrop-blur-sm transition-all duration-150 ${
            hovered ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0"
          }`}
        >
          {panorama.title}
        </div>

        <button
          type="button"
          onPointerDown={
            moveMode
              ? (e) => {
                  e.stopPropagation();
                  onGrab?.(panorama.id);
                }
              : undefined
          }
          onClick={
            moveMode
              ? undefined
              : (e) => {
                  e.stopPropagation();
                  onActivate(panorama.id);
                }
          }
          onPointerEnter={() => setHovered(true)}
          onPointerLeave={() => setHovered(false)}
          aria-label={
            moveMode
              ? `Move panorama ${panorama.title}`
              : `Open panorama ${panorama.title}`
          }
          className={`group relative grid h-6 w-6 place-items-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 ${
            moveMode
              ? dragging
                ? "cursor-grabbing"
                : "cursor-grab"
              : "cursor-pointer"
          } ${dragging ? "pointer-events-none" : ""}`}
        >
          <span
            aria-hidden="true"
            className="absolute h-6 w-6 rounded-full bg-cyan-400/30 motion-safe:animate-ping"
          />
          <span
            aria-hidden="true"
            className="absolute h-4 w-4 rounded-full border border-cyan-300/50 bg-cyan-500/10 backdrop-blur-sm transition-colors duration-150 group-hover:border-cyan-200/80 group-hover:bg-cyan-400/20"
          />
          <span
            aria-hidden="true"
            className="relative h-2.5 w-2.5 rounded-full bg-cyan-300 shadow-[0_0_10px_2px_rgba(34,211,238,0.7)] transition-transform duration-150 group-hover:scale-125"
          />
        </button>
      </div>
    </Html>
  );
}
