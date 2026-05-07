import { memo, useCallback, useMemo } from "react";
import { Html } from "@react-three/drei";
import type { MeasurePoint } from "@/measurement/domain/measurement";

interface PointMarkerProps {
  position: MeasurePoint;
  // Set when this marker should be clickable (currently used only for
  // the active chain's start vertex — clicking it closes the chain into
  // a loop). Default markers are passive overlays.
  variant?: "passive" | "active-start";
  onClick?: () => void;
}

// Screen-constant marker. World-space meshes scale with perspective;
// projecting through Html keeps the dot at a consistent pixel size for
// every depth, which reads correctly as a tool overlay. With Canvas
// frameloop="demand" the per-frame cost is zero.
//
// Variants:
//   - passive: small cyan disk, ignores pointer events, lets clicks
//     fall through to the surface so chain extension works through it.
//   - active-start: bigger, halo, pointer-events on, click closes the
//     active chain. The visual difference is the affordance — the user
//     should know which dot is "the one to click".
function PointMarkerImpl({
  position,
  variant = "passive",
  onClick,
}: PointMarkerProps) {
  const pos = useMemo<[number, number, number]>(
    () => [position.x, position.y, position.z],
    [position.x, position.y, position.z],
  );

  const handleClick = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      onClick?.();
    },
    [onClick],
  );

  if (variant === "active-start") {
    return (
      <Html position={pos} center zIndexRange={[40, 35]}>
        <button
          type="button"
          onClick={handleClick}
          aria-label="Close measurement chain"
          title="Click to close chain"
          className="group flex h-5 w-5 cursor-pointer items-center justify-center rounded-full bg-black/85 ring-2 ring-cyan-200 ring-offset-1 ring-offset-black/40 transition-transform hover:scale-110"
        >
          <span className="block h-2.5 w-2.5 rounded-full bg-cyan-300 shadow-[0_0_8px_rgba(103,232,249,1)] transition-all group-hover:bg-cyan-200" />
        </button>
      </Html>
    );
  }

  return (
    <Html position={pos} center zIndexRange={[30, 25]}>
      <div className="pointer-events-none flex h-3.5 w-3.5 items-center justify-center rounded-full bg-black/80 ring-1 ring-cyan-200/80">
        <div className="h-2 w-2 rounded-full bg-cyan-300 shadow-[0_0_6px_rgba(103,232,249,0.9)]" />
      </div>
    </Html>
  );
}

export default memo(PointMarkerImpl);
