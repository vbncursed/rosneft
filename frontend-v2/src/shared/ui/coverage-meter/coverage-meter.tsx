import { clsx as cx } from "clsx";
import type { ReactNode } from "react";
import { coverageSummary, type CoverageSegment, type CoverageTone } from "./coverage";

export type CoverageMeterProps = {
  /** Overline, e.g. "2FA coverage". */
  label: string;
  segments: CoverageSegment[];
  /** Mono readout on the right, e.g. "18 / 26". */
  detail?: ReactNode;
  /** Tone of that readout; defaults to the first segment's. */
  detailTone?: CoverageTone;
  className?: string;
};

const FILL: Record<CoverageTone, string> = {
  ok: "bg-ok",
  warn: "bg-warn",
  bad: "bg-bad",
  accent: "bg-accent",
  neutral: "bg-line-2",
};

const DOT: Record<CoverageTone, string> = FILL;

const TEXT: Record<CoverageTone, string> = {
  ok: "text-ok",
  warn: "text-warn",
  bad: "text-bad",
  accent: "text-accent",
  neutral: "text-muted",
};

/** One population split into states — a share of a whole, not a trend. */
export function CoverageMeter({
  label,
  segments,
  detail,
  detailTone,
  className,
}: CoverageMeterProps) {
  const filled = segments.filter((segment) => segment.value > 0);

  return (
    <div className={className}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted">{label}</span>
        {detail !== undefined ? (
          <span
            className={cx(
              "font-mono text-[11px]",
              TEXT[detailTone ?? segments[0]?.tone ?? "neutral"],
            )}
          >
            {detail}
          </span>
        ) : null}
      </div>

      <div
        role="img"
        aria-label={coverageSummary(label, segments)}
        // flex-grow rather than percentage widths: rounding each segment
        // independently leaves a gap or an overflow at the end of the bar.
        className="mt-3 flex h-2 overflow-hidden rounded-full border border-line"
      >
        {filled.map((segment) => (
          <span
            key={segment.label}
            style={{ flexGrow: segment.value }}
            className={FILL[segment.tone]}
          />
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-3.5">
        {segments.map((segment) => (
          <span
            key={segment.label}
            className="flex items-center gap-[7px] font-mono text-[10px] text-muted"
          >
            <span aria-hidden="true" className={cx("size-[7px] rounded-[2px]", DOT[segment.tone])} />
            {segment.label} · {segment.value}
          </span>
        ))}
      </div>
    </div>
  );
}
