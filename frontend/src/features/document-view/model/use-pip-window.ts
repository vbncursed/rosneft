import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import { dock, moved, resized, type PipGeometry } from "./pip-geometry";

type Size = { w: number; h: number };

const viewportSize = (): Size => ({ w: window.innerWidth, h: window.innerHeight });

// A zero box means "not laid out yet" or "no layer": the browser window is the
// honest answer, and it is what this hook measured before.
const sizeOf = (el: HTMLElement | null | undefined): Size =>
  el?.clientWidth && el.clientHeight ? { w: el.clientWidth, h: el.clientHeight } : viewportSize();

// usePipWindow tracks a floating window's position and size, driven by pointer
// drags on the title bar (move) and the corner grip (resize). Listeners attach
// to window so a drag keeps going even when the pointer outruns the small
// window; the geometry math itself is pure (pip-geometry.ts). Starts docked
// bottom-right of `area`, `inset` px from each edge.
//
// `area` is the element the window is positioned inside — the page's floating
// layer, which is the viewport container minus the header, the stats-strip row
// and the open Overlays panel. Measured against the *browser window* instead,
// the docked title bar's Expand/Hide/Delete/Exit cluster sat underneath the
// panel, and a window dragged up went off the top of the screen. It is a ref
// rather than a plain getter because the element answers the other half too:
// it resizes when the panel folds and when the browser does, so one
// ResizeObserver re-clamps for both. Given no ref, the browser window is the
// area, which is what Cosmos and the geometry specs use.
export function usePipWindow(inset = 14, area?: RefObject<HTMLElement | null>) {
  const [geo, setGeo] = useState<PipGeometry>(() => dock(sizeOf(area?.current), inset));
  const [dragging, setDragging] = useState(false);
  // Detaches the active drag's listeners; held in a ref so an unmount mid-drag
  // can run it (begin's closure isn't reachable from the cleanup effect).
  const stop = useRef<(() => void) | null>(null);

  // The area is a DOM box, and at the first render it has not been laid out —
  // so dock again as soon as it can be read. Once, on mount: a window the
  // reader has placed is re-clamped after that, never re-docked.
  const docked = useRef(false);
  useLayoutEffect(() => {
    if (docked.current) return;
    docked.current = true;
    setGeo(dock(sizeOf(area?.current), inset));
  }, [area, inset]);

  // Not memoised: it closes over `geo`, so it changed on every drag frame
  // anyway, and both handlers are plain props on one element.
  const begin = (kind: "move" | "resize") => (e: ReactPointerEvent<HTMLElement>) => {
    e.preventDefault();
    // The handle keeps the pointer, and with it the cursor, however far the
    // drag outruns it. Optional: jsdom has no pointer capture.
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const sx = e.clientX;
    const sy = e.clientY;
    const base = geo;
    setDragging(true);

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - sx;
      const dy = ev.clientY - sy;
      const box = sizeOf(area?.current);
      setGeo(kind === "move" ? moved(base, dx, dy, box) : resized(base, dx, dy, box));
    };
    const onUp = () => {
      setDragging(false);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      stop.current = null;
    };
    stop.current = onUp;
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    // A touch the browser takes back (a system gesture) never sends pointerup.
    window.addEventListener("pointercancel", onUp);
  };

  useEffect(() => () => stop.current?.(), []);

  // A shrunk area — the browser window, or the Overlays panel unfolding into
  // it — can leave the window partly or fully outside; re-run the move clamp
  // with a zero delta to pull it back in. Never a re-dock: the corner it was
  // put in is the reader's.
  useEffect(() => {
    const el = area?.current;
    const clamp = () => setGeo((g) => moved(g, 0, 0, sizeOf(el)));
    if (!el) {
      window.addEventListener("resize", clamp);
      return () => window.removeEventListener("resize", clamp);
    }
    const observer = new ResizeObserver(clamp);
    observer.observe(el);
    return () => observer.disconnect();
  }, [area]);

  return { geo, dragging, startMove: begin("move"), startResize: begin("resize") };
}
