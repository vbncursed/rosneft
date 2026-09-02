import type { ReactNode } from "react";
import { cx } from "@/shared/lib/cx";

export type ProgressTone = "accent" | "ok" | "bad";

export type ProgressBarProps = {
  /** 0–100. Omit it for the indeterminate "waiting to start" bar. */
  value?: number;
  tone?: ProgressTone;
  label?: ReactNode;
  /** Right-aligned readout, usually the percentage. */
  detail?: ReactNode;
  ariaLabel?: string;
  className?: string;
};

const FILL: Record<ProgressTone, string> = {
  accent: "bg-accent",
  ok: "bg-ok",
  bad: "bg-bad",
};

const TEXT: Record<ProgressTone, string> = {
  accent: "text-muted",
  ok: "text-ok",
  bad: "text-bad",
};

export function ProgressBar({
  value,
  tone = "accent",
  label,
  detail,
  ariaLabel,
  className,
}: ProgressBarProps) {
  const indeterminate = value === undefined;
  const pct = indeterminate ? 0 : Math.min(100, Math.max(0, value));

  return (
    <div className={className}>
      <div
        role="progressbar"
        aria-label={ariaLabel ?? (typeof label === "string" ? label : undefined)}
        aria-valuemin={indeterminate ? undefined : 0}
        aria-valuemax={indeterminate ? undefined : 100}
        aria-valuenow={indeterminate ? undefined : pct}
        className={cx(
          "h-1.5 overflow-hidden rounded-full border",
          tone === "bad" ? "border-bad bg-bad-soft" : "border-line bg-panel-2",
        )}
      >
        {indeterminate ? (
          <div className="h-full w-2/5 animate-indeterminate bg-linear-to-r from-transparent via-accent to-transparent motion-reduce:animate-none motion-reduce:w-full motion-reduce:opacity-40" />
        ) : (
          <div
            className={cx("h-full transition-[width] duration-300", FILL[tone])}
            style={{ width: `${pct}%` }}
          />
        )}
      </div>
      {label || detail ? (
        <p
          className={cx(
            "mt-[7px] flex justify-between gap-2 font-mono text-[11px]",
            TEXT[tone],
          )}
        >
          {label ? <span>{label}</span> : null}
          {detail ? <span>{detail}</span> : null}
        </p>
      ) : null}
    </div>
  );
}
