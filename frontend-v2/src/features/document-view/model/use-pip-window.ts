import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { dock, moved, resized, type PipGeometry } from "./pip-geometry";

const viewportSize = () => ({ w: window.innerWidth, h: window.innerHeight });

// usePipWindow tracks a floating window's position and size, driven by pointer
// drags on the title bar (move) and the corner grip (resize). Listeners attach
// to window so a drag keeps going even when the pointer outruns the small
// window; the geometry math itself is pure (pip-geometry.ts). Starts docked
// bottom-right, `inset` px from each edge.
export function usePipWindow(inset = 14) {
  const [geo, setGeo] = useState<PipGeometry>(() => dock(viewportSize(), inset));
  const [dragging, setDragging] = useState(false);
  // Detaches the active drag's listeners; held in a ref so an unmount mid-drag
  // can run it (begin's closure isn't reachable from the cleanup effect).
  const stop = useRef<(() => void) | null>(null);

  const begin = useCallback(
    (kind: "move" | "resize") => (e: ReactPointerEvent<HTMLElement>) => {
      e.preventDefault();
      const sx = e.clientX;
      const sy = e.clientY;
      const base = geo;
      setDragging(true);

      const onMove = (ev: PointerEvent) => {
        const dx = ev.clientX - sx;
        const dy = ev.clientY - sy;
        setGeo(kind === "move" ? moved(base, dx, dy, viewportSize()) : resized(base, dx, dy, viewportSize()));
      };
      const onUp = () => {
        setDragging(false);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        stop.current = null;
      };
      stop.current = onUp;
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [geo],
  );

  useEffect(() => () => stop.current?.(), []);

  // A shrunk viewport can leave the window partly or fully off-screen; re-run
  // the move clamp with a zero delta to pull it back inside.
  useEffect(() => {
    const onResize = () => setGeo((g) => moved(g, 0, 0, viewportSize()));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return { geo, dragging, startMove: begin("move"), startResize: begin("resize") };
}
