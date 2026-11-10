import type { Pt } from "@/entities/site-plan";

export function DrawingOverlay({
  start,
  end,
  pageSize,
}: {
  start: Pt;
  end: Pt;
  pageSize: { width: number; height: number };
}) {
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 size-full"
      viewBox={`0 0 ${pageSize.width} ${pageSize.height}`}
    >
      <polygon
        data-testid="manual-drawing"
        points={`${start.x},${start.y} ${end.x},${start.y} ${end.x},${end.y} ${start.x},${end.y}`}
        className="fill-accent/20 stroke-accent [vector-effect:non-scaling-stroke]"
      />
    </svg>
  );
}
