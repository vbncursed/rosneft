import { useCallback, useEffect, useRef, useState } from "react";

export interface PipGeometry {
  x: number;
  y: number;
  w: number;
  h: number;
}

const MIN_W = 320;
const MIN_H = 240;
const MARGIN = 16;
const INIT_W = 440;
const INIT_H = 560;

// usePipWindow tracks a floating window's position and size, driven by pointer
// drags on the title bar (move) and the corner grip (resize). Listeners attach
// to window so a drag keeps going even when the pointer outruns the small
// window; geometry is clamped to the viewport. Starts docked bottom-right.
export function usePipWindow() {
  const [geo, setGeo] = useState<PipGeometry>(() => {
    const vw = typeof window === "undefined" ? 1280 : window.innerWidth;
    const vh = typeof window === "undefined" ? 800 : window.innerHeight;
    return {
      w: INIT_W,
      h: INIT_H,
      x: Math.max(MARGIN, vw - INIT_W - MARGIN),
      y: Math.max(MARGIN, vh - INIT_H - MARGIN),
    };
  });
  const [dragging, setDragging] = useState(false);
  // Detaches the active drag's listeners; held in a ref so an unmount mid-drag
  // can run it (begin's closure isn't reachable from the cleanup effect).
  const stop = useRef<(() => void) | null>(null);

  const begin = useCallback(
    (kind: "move" | "resize") => (e: React.PointerEvent) => {
      e.preventDefault();
      const sx = e.clientX;
      const sy = e.clientY;
      const base = geo;
      setDragging(true);

      const move = (ev: PointerEvent) => {
        const dx = ev.clientX - sx;
        const dy = ev.clientY - sy;
        setGeo((g) =>
          kind === "move"
            ? {
                ...g,
                x: Math.min(Math.max(0, base.x + dx), window.innerWidth - g.w),
                y: Math.min(Math.max(0, base.y + dy), window.innerHeight - g.h),
              }
            : {
                ...g,
                w: Math.min(Math.max(MIN_W, base.w + dx), window.innerWidth - g.x),
                h: Math.min(Math.max(MIN_H, base.h + dy), window.innerHeight - g.y),
              },
        );
      };
      const up = () => {
        setDragging(false);
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        stop.current = null;
      };
      stop.current = up;
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    },
    [geo],
  );

  useEffect(() => () => stop.current?.(), []);

  return { geo, dragging, startMove: begin("move"), startResize: begin("resize") };
}
