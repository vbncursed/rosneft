import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent, type WheelEvent } from "react";
import type { PlanRect, Pt } from "@/entities/site-plan";
import { ViewportWindow, type ViewportWindowProps } from "@/shared/ui/viewport-window";
import { fitView, panBy, toPage, zoomAt, type View } from "../model/view-transform";
import { ZoomControls } from "./zoom-controls";
import { FenceOverlay } from "./fence-overlay";
import { DrawingOverlay } from "./drawing-overlay";
import { PairMarkers } from "./pair-markers";
import { RectOverlay, type WindowZone } from "./rect-overlay";

export type SitePlanWindowProps = {
  image: ImageBitmap | null;
  pageSize: { width: number; height: number };
  rects: PlanRect[];
  zones: WindowZone[];
  pairs: { pdf: Pt }[];
  pending?: Pt | null;
  selected: number | null;
  metresPerPt?: number | null;
  placing?: boolean;
  drawing?: boolean;
  fenceDrawing?: boolean;
  fencePoints?: Pt[];
  fenceClosed?: boolean;
  pageKey?: string;
  onDrawRect?: (start: Pt, end: Pt) => void;
  onSelectRect: (index: number) => void;
  onDragPair: (index: number, to: Pt) => void;
  onPlanClick: (at: Pt) => void;
  title?: string;
  frame?: Partial<Pick<ViewportWindowProps, "geometry" | "actions" | "onMoveStart" | "onResizeStart" | "dragging">>;
};

const WHEEL_SENSITIVITY = 0.0015;
const WHEEL_MAX_FACTOR = 2,
  CLICK_SLOP_PX = 4;

/** The site plan on a pan-and-zoom sheet: detected rectangles to pick, saved zones filled, pair markers to drag. */
export function SitePlanWindow({ frame, title = "Site plan", ...plan }: SitePlanWindowProps) {
  const { image, pageSize, onPlanClick } = plan;
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const press = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const touched = useRef(false);
  const drawStart = useRef<Pt | null>(null);
  const [preview, setPreview] = useState<{ start: Pt; end: Pt } | null>(null);
  const [view, setView] = useState<View>({ k: 1, x: 0, y: 0 });
  const { width, height } = pageSize;

  const local = (clientX: number, clientY: number): Pt => {
    const r = box.current?.getBoundingClientRect();
    return { x: clientX - (r?.left ?? 0), y: clientY - (r?.top ?? 0) };
  };
  const size = () => ({ w: box.current?.clientWidth ?? 0, h: box.current?.clientHeight ?? 0 });
  const fit = () => setView(fitView(size(), pageSize));

  useLayoutEffect(() => {
    touched.current = false;
    const el = box.current;
    if (!el) return;
    // Fit to the mounted element before the browser paints the sheet.
    const fitted = () => fitView({ w: el.clientWidth, h: el.clientHeight }, { width, height });
    setView(fitted());
    const watch = new ResizeObserver(() => !touched.current && setView(fitted()));
    watch.observe(el);
    return () => watch.disconnect();
  }, [box, width, height]);

  useLayoutEffect(() => {
    press.current = null;
    drawStart.current = null;
    // oxlint-disable-next-line react/set-state-in-effect -- clear the preview with the captured gesture before paint
    setPreview(null);
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- page and tool changes invalidate the active gesture
  }, [plan.drawing, plan.fenceDrawing, plan.placing, plan.pageKey]);

  useEffect(() => {
    const el = canvas.current;
    if (!el || !image) return;
    [el.width, el.height] = [image.width, image.height];
    el.getContext("2d")?.drawImage(image, 0, 0);
  }, [canvas, image]);

  const change = (next: View) => {
    touched.current = true;
    setView(next);
  };
  const down = (e: PointerEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    if (plan.drawing && e.button === 0) {
      e.currentTarget.setPointerCapture?.(e.pointerId);
      const start = toPage(view, local(e.clientX, e.clientY));
      drawStart.current = start;
      setPreview({ start, end: start });
      return;
    }
    e.currentTarget.setPointerCapture?.(e.pointerId);
    press.current = { x: e.clientX, y: e.clientY, moved: false };
  };
  const move = (e: PointerEvent) => {
    const start = drawStart.current;
    if (start) {
      if (e.buttons === 0) {
        drawStart.current = null;
        setPreview(null);
      } else setPreview({ start, end: toPage(view, local(e.clientX, e.clientY)) });
      return;
    }
    const p = press.current;
    if (!p) return;
    if (e.buttons === 0) return void (press.current = null);
    if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > CLICK_SLOP_PX) p.moved = true;
    if (!p.moved) return;
    change(panBy(view, e.clientX - p.x, e.clientY - p.y));
    [p.x, p.y] = [e.clientX, e.clientY];
  };
  const up = (e: PointerEvent) => {
    if (drawStart.current) {
      if (plan.drawing) plan.onDrawRect?.(drawStart.current, toPage(view, local(e.clientX, e.clientY)));
      drawStart.current = null;
      setPreview(null);
      return;
    }
    const p = press.current;
    press.current = null;
    if (p && !p.moved) onPlanClick(toPage(view, local(e.clientX, e.clientY)));
  };
  const endPress = () => {
    press.current = null;
    drawStart.current = null;
    setPreview(null);
  };
  // Scaled by the delta, so a trackpad's stream of small events zooms gently.
  const wheel = (e: WheelEvent) => {
    const factor = Math.min(WHEEL_MAX_FACTOR, Math.max(1 / WHEEL_MAX_FACTOR, Math.exp(-e.deltaY * WHEEL_SENSITIVITY)));
    change(zoomAt(view, factor, local(e.clientX, e.clientY)));
  };
  const zoom = (factor: number) => change(zoomAt(view, factor, { x: size().w / 2, y: size().h / 2 }));

  return (
    // A plan point waiting for the model: the model is usually right under the docked window.
    <ViewportWindow title={title} geometry={null} actions={[]} {...frame} seeThrough={Boolean(plan.pending)}>
      <div
        ref={box}
        role="group"
        aria-label="Site plan sheet"
        data-tour="plan-sheet"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={endPress}
        onLostPointerCapture={endPress}
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
            passThrough={Boolean(plan.placing || plan.drawing || plan.fenceDrawing)}
            onSelect={plan.onSelectRect}
          />
          <FenceOverlay
            points={plan.fencePoints ?? []}
            closed={Boolean(plan.fenceClosed)}
            pageSize={pageSize}
            k={view.k}
          />
          {preview ? <DrawingOverlay {...preview} pageSize={pageSize} /> : null}
          <div className={plan.drawing || plan.fenceDrawing ? "pointer-events-none" : undefined}>
            <PairMarkers
              pairs={plan.pairs}
              pending={plan.pending ?? null}
              k={view.k}
              toPage={(x, y) => toPage(view, local(x, y))}
              onDrag={plan.onDragPair}
            />
          </div>
        </div>
        {plan.zones.length > 0 ? (
          <ul aria-label="Saved zones" className="sr-only">
            {plan.zones.map((z) => (
              <li key={z.id}>{z.title}</li>
            ))}
          </ul>
        ) : null}
        <ZoomControls
          zoom={zoom}
          fit={() => {
            touched.current = false;
            fit();
          }}
        />
      </div>
    </ViewportWindow>
  );
}
