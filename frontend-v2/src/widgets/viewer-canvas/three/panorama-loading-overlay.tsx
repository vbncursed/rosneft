import { useEffect, useRef } from "react";
import { useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { clsx as cx } from "clsx";
import { ProgressBar } from "@/shared/ui/progress-bar";

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

const LABEL = "Loading panorama";

/** Matches `duration-200` on the leaving cover; reduced motion's 100ms fits inside it. */
const LEAVE_MS = 200;

interface PanoramaLoadingOverlayProps {
  /** 0–100, or null for indeterminate (server sent no Content-Length). */
  progress: number | null;
  /** The photo is ready: fade out, then call `onLeft` so the parent unmounts us. */
  leaving: boolean;
  onLeft: () => void;
}

// Fades in over the 3D view and out over the photograph, so the switch reads
// as one change rather than two cuts. A timer, not `transitionend`: a cover
// told to leave before its entrance started never changes opacity, fires no
// event, and would sit invisible over the canvas for good.
export default function PanoramaLoadingOverlay({ progress, leaving, onLeft }: PanoramaLoadingOverlayProps) {
  const size = useThree((s) => s.size);

  // The parent hands a fresh closure every render; the timer keys on `leaving`.
  const latest = useRef(onLeft);
  useEffect(() => {
    latest.current = onLeft;
  });
  useEffect(() => {
    if (!leaving) return;
    const t = setTimeout(() => latest.current(), LEAVE_MS);
    return () => clearTimeout(t);
  }, [leaving]);

  return (
    <Html calculatePosition={TOP_LEFT} style={{ width: size.width, height: size.height }}>
      <div
        className={cx(
          "flex h-full w-full items-center justify-center bg-panel/80 transition-opacity ease-out starting:opacity-0 motion-reduce:duration-100",
          leaving ? "pointer-events-none opacity-0 duration-200" : "duration-150",
        )}
      >
        <ProgressBar
          className="w-64"
          variant="thin"
          value={progress ?? undefined}
          label={LABEL}
          detail={progress === null ? undefined : `${Math.round(progress)}%`}
        />
      </div>
    </Html>
  );
}
