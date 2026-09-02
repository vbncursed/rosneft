import type { ReactNode } from "react";
import { clsx as cx } from "clsx";

export type ProgressTone = "accent" | "ok" | "bad";

export type ProgressBarProps = {
  /** 0–100. Omit it for the indeterminate "waiting to start" bar. */
  value?: number;
  tone?: ProgressTone;
  label?: ReactNode;
  /** Right-aligned readout, usually the percentage. */
  detail?: ReactNode;
  ariaLabel?: string;
  /** thin is the frameless 5px meter the role cards and inspector use. */
  variant?: "framed" | "thin";
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
  variant = "framed",
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
          "overflow-hidden rounded-full",
          variant === "thin"
            ? "h-[5px] bg-panel-2"
            : cx("h-1.5 border", tone === "bad" ? "border-bad bg-bad-soft" : "border-line bg-panel-2"),
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
