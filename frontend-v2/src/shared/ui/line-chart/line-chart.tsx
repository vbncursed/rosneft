import { clsx as cx } from "clsx";
import { DEFAULT_GEOMETRY, sharedMax, toAreaPath, toLinePath } from "./path";

/** Categorical order, assigned by position and never cycled. */
export type SeriesTone = "accent" | "ok" | "bad" | "warn" | "muted";

export type Series = {
  label: string;
  values: number[];
  tone?: SeriesTone;
  /** A reference or comparison line, drawn thinner and dashed. */
  dashed?: boolean;
};

export type LineChartProps = {
  series: Series[];
  /** Names the chart for assistive tech; the summary is derived from it. */
  label: string;
  /** Unit for the spoken summary, e.g. "ms" or "requests per second". */
  unit?: string;
  height?: number;
  className?: string;
};

const STROKE: Record<SeriesTone, string> = {
  accent: "var(--accent)",
  ok: "var(--ok)",
  bad: "var(--bad)",
  warn: "var(--warn)",
  muted: "var(--muted)",
};

const FILL: Record<SeriesTone, string> = {
  accent: "var(--accent-soft)",
  ok: "var(--ok-soft)",
  bad: "var(--bad-soft)",
  warn: "var(--warn-soft)",
  muted: "transparent",
};

const ORDER: SeriesTone[] = ["accent", "ok", "bad", "muted", "warn"];

const toneOf = (series: Series, index: number) => series.tone ?? ORDER[index % ORDER.length];

/** The last reading of each series — what a reader would otherwise squint for. */
function summarise(series: Series[], label: string, unit?: string): string {
  if (series.length === 0) return `${label}: no data`;
  const parts = series.map((s) => {
    const last = s.values.at(-1);
    if (last === undefined) return `${s.label} no data`;
    return `${s.label} ${Number(last.toFixed(2))}${unit ? ` ${unit}` : ""}`;
  });
  return `${label}: ${parts.join(", ")}`;
}

export function LineChart({
  series,
  label,
  unit,
  height = DEFAULT_GEOMETRY.height,
  className,
}: LineChartProps) {
  const geo = { ...DEFAULT_GEOMETRY, height };
  const max = sharedMax(series);
  // A single series is filled; several would obscure one another, so they stay
  // as lines.
  const filled = series.length === 1;

  return (
    <div
      role="img"
      aria-label={summarise(series, label, unit)}
      className={cx(
        "relative overflow-hidden rounded-[9px] border border-line bg-panel-2",
        className,
      )}
      style={{
        height,
        backgroundImage: "linear-gradient(var(--grid) 1px, transparent 1px)",
        backgroundSize: "100% 22px",
      }}
    >
      <svg
        viewBox={`0 0 ${geo.width} ${geo.height}`}
        preserveAspectRatio="none"
        className="absolute inset-0 size-full"
      >
        {filled
          ? series.map((s, i) => (
              <path
                key={`area-${s.label}`}
                d={toAreaPath(s.values, max, geo)}
                fill={FILL[toneOf(s, i)]}
                stroke="none"
              />
            ))
          : null}

        {series.map((s, i) => (
          <path
            key={`line-${s.label}`}
            d={toLinePath(s.values, max, geo)}
            fill="none"
            stroke={STROKE[toneOf(s, i)]}
            strokeWidth={s.dashed ? 1.3 : 1.8}
            strokeDasharray={s.dashed ? "4 4" : undefined}
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
    </div>
  );
}

export type ChartLegendProps = {
  series: Series[];
  className?: string;
};

/** Identity is never colour alone: every series is named beside its swatch. */
export function ChartLegend({ series, className }: ChartLegendProps) {
  return (
    <div className={cx("flex flex-wrap gap-3", className)}>
      {series.map((s, i) => (
        <span
          key={s.label}
          className="flex items-center gap-1.5 font-mono text-[10px] text-muted"
        >
          <span
            aria-hidden="true"
            className="h-0.5 w-3"
            style={{ background: STROKE[toneOf(s, i)] }}
          />
          {s.label}
        </span>
      ))}
    </div>
  );
}
