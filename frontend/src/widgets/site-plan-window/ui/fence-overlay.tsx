import type { Pt } from "@/entities/site-plan";

export function FenceOverlay({
  points,
  closed,
  pageSize,
  k,
}: {
  points: Pt[];
  closed: boolean;
  pageSize: { width: number; height: number };
  k: number;
}) {
  if (!points.length) return null;
  const path = points.map((p) => `${p.x},${p.y}`).join(" ");
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 size-full"
      viewBox={`0 0 ${pageSize.width} ${pageSize.height}`}
    >
      {closed ? (
        <polygon points={path} className="fill-ok/10 stroke-ok [vector-effect:non-scaling-stroke]" />
      ) : (
        <polyline points={path} className="fill-none stroke-ok [vector-effect:non-scaling-stroke]" />
      )}
      {points
        .filter((p, i) => points.findIndex((q) => q.x === p.x && q.y === p.y) === i)
        .map((p) => (
          <circle key={`${p.x},${p.y}`} cx={p.x} cy={p.y} r={4 / k} className="fill-ok" />
        ))}
    </svg>
  );
}
