import { clsx as cx } from "clsx";
import { ChartLegend, LineChart, type Series } from "@/shared/ui/line-chart";
import type { StatTileTone } from "@/entities/metric";

export type MetricPanelProps = {
  title: string;
  /** What the chart plots, e.g. "p50 / p95 / p99 · ms". */
  meta: string;
  /** The latest reading, printed large beside the title. */
  last: string;
  lastTone?: StatTileTone;
  series: Series[];
  /** Unit for the chart's spoken summary. */
  unit?: string;
  selected?: boolean;
  onSelect?: () => void;
};

const TONE: Record<StatTileTone, string> = {
  accent: "text-accent",
  fg: "text-fg",
  ok: "text-ok",
  warn: "text-warn",
  bad: "text-bad",
  muted: "text-muted",
};

export function MetricPanel({
  title,
  meta,
  last,
  lastTone = "fg",
  series,
  unit,
  selected = false,
  onSelect,
}: MetricPanelProps) {
  return (
    <article
      onClick={onSelect}
      aria-current={selected ? "true" : undefined}
      aria-label={title}
      className={cx(
        "cursor-pointer rounded-card border px-4 py-4 transition-colors duration-150",
        selected ? "border-accent bg-accent-soft" : "border-line bg-panel hover:border-line-2",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="m-0 truncate text-[13px] font-semibold text-fg">{title}</p>
          <p className="m-0 mt-[3px] font-mono text-[10px] text-dim">{meta}</p>
        </div>
        <p className={cx("m-0 whitespace-nowrap font-mono text-[15px]", TONE[lastTone])}>{last}</p>
      </div>

      <LineChart className="mt-3" series={series} label={title} unit={unit} />
      <ChartLegend className="mt-3" series={series} />
    </article>
  );
}
