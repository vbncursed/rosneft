import { memo, useCallback, useMemo } from "react";
import { Html } from "@react-three/drei";
import type { MeasurePoint } from "@/entities/measurement";

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
//   - passive: small accent ring, ignores pointer events, lets clicks
//     fall through to the surface so chain extension works through it.
//   - active-start: bigger, haloed, pointer-events on, click closes the
//     active chain. The visual difference is the affordance — the user
//     should know which dot is "the one to click".
function PointMarkerImpl({ position, variant = "passive", onClick }: PointMarkerProps) {
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
          className="size-4 cursor-pointer rounded-full border-2 border-accent bg-panel ring-4 ring-accent-soft transition-transform hover:scale-110"
        />
      </Html>
    );
  }

  return (
    <Html position={pos} center zIndexRange={[30, 25]}>
      <div className="pointer-events-none size-3 rounded-full border-2 border-accent bg-panel" />
    </Html>
  );
}

export default memo(PointMarkerImpl);
