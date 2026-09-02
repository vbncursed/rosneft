import { clsx as cx } from "clsx";
import type { ReactNode } from "react";
import { toBars } from "./scale";

export type SparklineProps = {
  values: number[];
  /** Overline on the left, e.g. "Events". */
  label: string;
  /** Mono note on the right, e.g. "peak 41/h". */
  detail?: ReactNode;
  /** Index from which buckets are still filling in; those are drawn muted. */
  dimFrom?: number;
  /** Names the unit in the accessible summary, e.g. "events per hour". */
  unit?: string;
  className?: string;
};

export function Sparkline({
  values,
  label,
  detail,
  dimFrom,
  unit = "events",
  className,
}: SparklineProps) {
  const bars = toBars(values, dimFrom);
  const peak = bars.find((bar) => bar.peak);

  return (
    <div className={cx("rounded-[10px] border border-line bg-panel-2 px-4 py-3.5", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted">{label}</span>
        {detail ? <span className="font-mono text-[11px] text-muted">{detail}</span> : null}
      </div>

      <div
        role="img"
        // A bar chart this small has no axes to read, so the summary carries
        // the numbers a reader would otherwise have to estimate.
        aria-label={
          bars.length === 0
            ? `${label}: no data`
            : `${label}: ${bars.length} buckets, peak ${peak?.value ?? 0} ${unit}`
        }
        className="mt-3 flex h-13 items-end gap-[3px] overflow-hidden"
      >
        {bars.map((bar, index) => (
          <span
            key={index}
            style={{ height: `${bar.heightPct}%` }}
            className={cx(
              "min-h-px flex-1 rounded-t-[3px]",
              bar.provisional ? "bg-line-2" : bar.peak ? "bg-accent" : "bg-accent-line",
            )}
          />
        ))}
      </div>
    </div>
  );
}
