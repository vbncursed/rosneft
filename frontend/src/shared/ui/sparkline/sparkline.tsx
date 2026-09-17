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
  /** Which bar takes the accent: the tallest, or the most recent. */
  highlight?: "peak" | "last";
  /** Off for a bare row sparkline with no heading of its own. */
  showHeader?: boolean;
  className?: string;
};

export function Sparkline({
  values,
  label,
  detail,
  dimFrom,
  unit = "events",
  highlight = "peak",
  showHeader = true,
  className,
}: SparklineProps) {
  const bars = toBars(values, dimFrom, highlight);
  const peak = bars.find((bar) => bar.peak);

  return (
    <div className={className}>
      {showHeader ? (
        <div className="flex items-baseline justify-between gap-3">
          <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted">
            {label}
          </span>
          {detail ? <span className="font-mono text-[11px] text-muted">{detail}</span> : null}
        </div>
      ) : null}

      <div
        role="img"
        // A bar chart this small has no axes to read, so the summary carries
        // the numbers a reader would otherwise have to estimate.
        aria-label={
          bars.length === 0
            ? `${label}: no data`
            : highlight === "last"
              ? `${label}: ${bars.length} buckets, latest ${peak?.value ?? 0} ${unit}`
              : `${label}: ${bars.length} buckets, peak ${peak?.value ?? 0} ${unit}`
        }
        className={cx("flex items-end gap-[3px] overflow-hidden", showHeader ? "mt-3 h-13" : "h-full")}
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
