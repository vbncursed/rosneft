import type { ReactNode } from "react";
import { clsx as cx } from "clsx";

export type ProgressTone = "accent" | "ok" | "warn" | "bad";

export type ProgressBarProps = {
  /** 0–100. Omit it for the indeterminate "waiting to start" bar (md), or for a caption with no track (lg). */
  value?: number;
  tone?: ProgressTone;
  label?: ReactNode;
  /** Right-aligned readout, usually the percentage. */
  detail?: ReactNode;
  ariaLabel?: string;
  /** thin is the frameless 5px meter the role cards and inspector use. */
  variant?: "framed" | "thin";
  /** lg is the conversion page's 8px card bar with its caption above the track. */
  size?: "md" | "lg";
  className?: string;
};

const FILL: Record<ProgressTone, string> = {
  accent: "bg-accent",
  ok: "bg-ok",
  warn: "bg-warn",
  bad: "bg-bad",
};

const TEXT: Record<ProgressTone, string> = {
  accent: "text-muted",
  ok: "text-ok",
  warn: "text-warn",
  bad: "text-bad",
};

export function ProgressBar({
  value,
  tone = "accent",
  label,
  detail,
  ariaLabel,
  variant = "framed",
  size = "md",
  className,
}: ProgressBarProps) {
  const indeterminate = value === undefined;
  const pct = indeterminate ? 0 : Math.min(100, Math.max(0, value));
  const name = ariaLabel ?? (typeof label === "string" ? label : undefined);

  if (size === "lg") {
    return (
      <div className={className}>
        {label || detail ? (
          <p
            className={cx(
              "m-0 flex flex-wrap items-baseline justify-between gap-3",
              // The mock's queued card is the caption alone — nothing to space from.
              indeterminate ? undefined : "mb-3.5",
            )}
          >
            {label ? <span className="text-[13px] font-semibold text-fg">{label}</span> : null}
            {detail ? (
              <span className={cx("font-mono text-[11px]", indeterminate ? "text-muted" : "text-accent")}>
                {detail}
              </span>
            ) : null}
          </p>
        ) : null}
        {indeterminate ? null : (
          <div
            role="progressbar"
            aria-label={name}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            className="h-2 overflow-hidden rounded-full border border-line bg-panel-2"
          >
            <div
              className={cx("h-full transition-[width] duration-300", FILL[tone])}
              style={{ width: `${pct}%` }}
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={className}>
      <div
        role="progressbar"
        aria-label={name}
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
