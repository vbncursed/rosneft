import { clsx as cx } from "clsx";
import type { PlanRect, Pt } from "@/entities/site-plan";
import { rectNames } from "../model/rect-names";

export type WindowZone = { id: number; title: string; corners: Pt[] };

export type RectOverlayProps = {
  rects: PlanRect[];
  zones: WindowZone[];
  selected: number | null;
  /** Metres per page point; without it the rectangles are named in points. */
  metresPerPt: number | null;
  /** The view's zoom, so strokes and titles keep their on-screen size. */
  k: number;
  pageSize: { width: number; height: number };
  onSelect: (index: number) => void;
};

// A rectangle is identified by where it sits on the page.
const rectKey = (r: PlanRect) => `${r.corners[0].x},${r.corners[0].y}`;
const points = (corners: Pt[]) => corners.map((c) => `${c.x},${c.y}`).join(" ");
const centre = (corners: Pt[]): Pt => ({
  x: corners.reduce((s, c) => s + c.x, 0) / corners.length,
  y: corners.reduce((s, c) => s + c.y, 0) / corners.length,
});

/** Zones as filled outlines with their titles, detected rectangles as outlines, and a real button over each rectangle. */
export function RectOverlay({ rects, zones, selected, metresPerPt, k, pageSize, onSelect }: RectOverlayProps) {
  const names = rectNames(rects, metresPerPt);
  return (
    <>
      <svg
        aria-hidden="true"
        viewBox={`0 0 ${pageSize.width} ${pageSize.height}`}
        className="pointer-events-none absolute inset-0 size-full"
      >
        {zones.map((z) => (
          <g key={z.id}>
            <polygon points={points(z.corners)} className="fill-ok/25 stroke-ok [vector-effect:non-scaling-stroke]" />
            <text
              x={centre(z.corners).x}
              y={centre(z.corners).y}
              fontSize={12 / k}
              strokeWidth={3 / k}
              textAnchor="middle"
              className="fill-fg stroke-bg font-mono [paint-order:stroke]"
            >
              {z.title}
            </text>
          </g>
        ))}
        {rects.map((r, i) => (
          <polygon
            key={rectKey(r)}
            points={points(r.corners)}
            strokeWidth={selected === i ? 3 : 1.5}
            className={cx(
              "stroke-accent [vector-effect:non-scaling-stroke]",
              selected === i ? "fill-accent/20" : "fill-transparent",
            )}
          />
        ))}
      </svg>
      {rects.map((r, i) => {
        const [x0, x1] = [Math.min(...r.corners.map((c) => c.x)), Math.max(...r.corners.map((c) => c.x))];
        const [y0, y1] = [Math.min(...r.corners.map((c) => c.y)), Math.max(...r.corners.map((c) => c.y))];
        const clip = r.corners.map((c) => `${((c.x - x0) / (x1 - x0)) * 100}% ${((c.y - y0) / (y1 - y0)) * 100}%`);
        return (
          <button
            key={rectKey(r)}
            type="button"
            aria-label={names[i]}
            aria-pressed={selected === i}
            onClick={() => onSelect(i)}
            style={{ left: x0, top: y0, width: x1 - x0, height: y1 - y0, clipPath: `polygon(${clip.join(",")})` }}
            className="absolute cursor-pointer bg-transparent hover:bg-accent/25 focus-visible:bg-accent/30 aria-pressed:bg-accent/15"
          />
        );
      })}
    </>
  );
}
