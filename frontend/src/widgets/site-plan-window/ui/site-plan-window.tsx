import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent, type WheelEvent } from "react";
import type { PlanRect, Pt } from "@/entities/site-plan";
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import { ViewportWindow, type ViewportWindowProps } from "@/shared/ui/viewport-window";
import { fitView, panBy, toPage, zoomAt, type View } from "../model/view-transform";
import { PairMarkers } from "./pair-markers";
import { RectOverlay, type WindowZone } from "./rect-overlay";

export type SitePlanWindowProps = {
  /** The page as a picture; a blank sheet is drawn while it is null. */
  image: ImageBitmap | null;
  pageSize: { width: number; height: number };
  rects: PlanRect[];
  zones: WindowZone[];
  pairs: { pdf: Pt }[];
  pending?: Pt | null;
  selected: number | null;
  metresPerPt?: number | null;
  onSelectRect: (index: number) => void;
  onDragPair: (index: number, to: Pt) => void;
  /** A click on the bare sheet, in page points. */
  onPlanClick: (at: Pt) => void;
  title?: string;
  /** Placement and chrome of the window, as the document window gets them. */
  frame?: Partial<Pick<ViewportWindowProps, "geometry" | "actions" | "onMoveStart" | "onResizeStart" | "dragging">>;
};

const ZOOM_STEP = 1.25;
const CLICK_SLOP_PX = 4;

/** The site plan on a pan-and-zoom sheet: detected rectangles to pick, saved zones filled, pair markers to drag. */
export function SitePlanWindow({ frame, title = "Site plan", ...plan }: SitePlanWindowProps) {
  const { image, pageSize, onPlanClick } = plan;
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const press = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const touched = useRef(false);
  const [view, setView] = useState<View>({ k: 1, x: 0, y: 0 });

  const local = (clientX: number, clientY: number): Pt => {
    const r = box.current?.getBoundingClientRect();
    return { x: clientX - (r?.left ?? 0), y: clientY - (r?.top ?? 0) };
  };
  const size = () => ({ w: box.current?.clientWidth ?? 0, h: box.current?.clientHeight ?? 0 });
  const fit = () => setView(fitView(size(), pageSize));

  useLayoutEffect(() => {
    if (!touched.current) fit();
    const el = box.current;
    if (!el) return;
    const watch = new ResizeObserver(() => !touched.current && fit());
    watch.observe(el);
    return () => watch.disconnect();
    // The sheet refits when the page (and so its size) changes, not on every render.
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- fit reads only refs and pageSize
  }, [pageSize.width, pageSize.height]);

  useEffect(() => {
    const el = canvas.current;
    if (!el || !image) return;
    [el.width, el.height] = [image.width, image.height];
    el.getContext("2d")?.drawImage(image, 0, 0);
  }, [image]);

  const change = (next: View) => {
    touched.current = true;
    setView(next);
  };
  const down = (e: PointerEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    press.current = { x: e.clientX, y: e.clientY, moved: false };
  };
  const move = (e: PointerEvent) => {
    const p = press.current;
    if (!p) return;
    if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > CLICK_SLOP_PX) p.moved = true;
    if (!p.moved) return;
    change(panBy(view, e.clientX - p.x, e.clientY - p.y));
    [p.x, p.y] = [e.clientX, e.clientY];
  };
  const up = (e: PointerEvent) => {
    const p = press.current;
    press.current = null;
    if (p && !p.moved) onPlanClick(toPage(view, local(e.clientX, e.clientY)));
  };
  const wheel = (e: WheelEvent) =>
    change(zoomAt(view, e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP, local(e.clientX, e.clientY)));
  const zoom = (factor: number) => change(zoomAt(view, factor, { x: size().w / 2, y: size().h / 2 }));

  return (
    <ViewportWindow title={title} geometry={null} actions={[]} {...frame}>
      <div
        ref={box}
        role="group"
        aria-label="Site plan sheet"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onWheel={wheel}
        className="absolute inset-0 cursor-crosshair touch-none select-none overflow-hidden"
      >
        <div
          style={{
            width: pageSize.width,
            height: pageSize.height,
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})`,
          }}
          className="absolute left-0 top-0 origin-top-left bg-white"
        >
          {image ? <canvas ref={canvas} className="size-full" /> : null}
          <RectOverlay
            rects={plan.rects}
            zones={plan.zones}
            selected={plan.selected}
            metresPerPt={plan.metresPerPt ?? null}
            k={view.k}
            pageSize={pageSize}
            onSelect={plan.onSelectRect}
          />
          <PairMarkers
            pairs={plan.pairs}
            pending={plan.pending ?? null}
            k={view.k}
            toPage={(x, y) => toPage(view, local(x, y))}
            onDrag={plan.onDragPair}
          />
        </div>
        <div className="absolute bottom-3 left-3 flex gap-1.5">
          <Button shape="icon" size="sm" variant="secondary" aria-label="Zoom in" onClick={() => zoom(ZOOM_STEP)}>
            <Icon name="plus" size={12} />
          </Button>
          <Button shape="icon" size="sm" variant="secondary" aria-label="Zoom out" onClick={() => zoom(1 / ZOOM_STEP)}>
            <Icon name="minus" size={12} />
          </Button>
          <Button
            shape="icon"
            size="sm"
            variant="secondary"
            aria-label="Fit the page"
            onClick={() => {
              touched.current = false;
              fit();
            }}
          >
            <Icon name="maximize" size={12} />
          </Button>
        </div>
      </div>
    </ViewportWindow>
  );
}
