import { useCallback } from "react";
import { Html } from "@react-three/drei";
import type { Panorama } from "@/entities/panorama";
import type { Vec3 } from "@/entities/placement";

const CALIBRATION_CHIP = "anchor · drag to move";

interface PanoramaMarkerProps {
  panorama: Panorama;
  onActivate: (id: number) => void;
  /** Move mode: the marker is dragged to a new anchor instead of opened. */
  moveMode?: boolean;
  /** This is the anchor being aligned: the mock's 12 px filled ring and its chip. */
  calibrating?: boolean;
  dragging?: boolean;
  livePos?: Vec3 | null;
  onGrab?: (id: number) => void;
}

// PanoramaMarker is the anchor of one panorama in the 3D view: a 10 px accent
// ring with the title beside it, drawn through drei <Html> so it keeps a
// constant screen size at any depth and is clicked through the DOM rather than
// the raycaster. Colours are Tailwind tokens — this is DOM, not three, so no
// colour crosses the Canvas boundary for it.
//
// Two modes: normally a click enters the panorama; in move mode a pointerdown
// grabs it and PanoramaDragController projects the cursor onto the territory.
export default function PanoramaMarker({
  panorama,
  onActivate,
  moveMode = false,
  calibrating = false,
  dragging = false,
  livePos = null,
  onGrab,
}: PanoramaMarkerProps) {
  // Mid-drag the marker follows the live surface point; otherwise it sits at
  // its saved anchor. A grab that has not yet resolved a point stays put.
  const at = dragging && livePos ? livePos : panorama.position;

  const grab = useCallback(
    (event: React.PointerEvent) => {
      event.stopPropagation();
      onGrab?.(panorama.id);
    },
    [onGrab, panorama.id],
  );

  const activate = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      onActivate(panorama.id);
    },
    [onActivate, panorama.id],
  );

  // One cursor per state, and one size/fill pair per state, resolved here:
  // clsx would merge nothing and two `size-*` or two `bg-*` utilities on one
  // element are a coin toss.
  const cursor = moveMode ? (dragging ? "cursor-grabbing" : "cursor-grab") : "cursor-pointer";
  const ring = calibrating ? "size-3 bg-accent-soft" : "size-2.5 bg-panel";

  return (
    <Html position={[at.x, at.y, at.z]} center zIndexRange={[20, 10]}>
      {/* While this marker is the one being dragged it must not swallow the
          pointermove the drag controller listens for on window. */}
      <div className={dragging ? "relative pointer-events-none" : "relative"}>
        <button
          type="button"
          data-tour="panorama-marker"
          onPointerDown={moveMode ? grab : undefined}
          onClick={moveMode ? undefined : activate}
          aria-label={`${moveMode ? "Move" : "Open"} panorama ${panorama.title}`}
          className={`block rounded-full border-2 border-accent p-0 transition-transform duration-150 hover:scale-125 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${ring} ${cursor}`}
        />
        {calibrating ? (
          // The title is the 3D view's question ("which capture is this?").
          // Mid-alignment the question is what to do with the ring under the
          // cursor, and the panel already names the capture being edited.
          <span className="absolute -top-1.75 left-4 whitespace-nowrap rounded-control-sm border border-accent bg-panel px-[7px] py-[3px] font-mono text-[10px] text-accent shadow-elevation">
            {CALIBRATION_CHIP}
          </span>
        ) : (
          <span className="absolute -top-1.5 left-3.5 whitespace-nowrap font-mono text-[10px] text-accent">
            {panorama.title}
          </span>
        )}
      </div>
    </Html>
  );
}
