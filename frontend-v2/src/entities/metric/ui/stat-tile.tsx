import { clsx as cx } from "clsx";
import type { ReactNode } from "react";
import { readout, readoutLabel, type MetricState } from "../model/metric";

export type StatTileTone = "accent" | "fg" | "ok" | "warn" | "bad" | "muted";

export type StatTileProps = {
  label: string;
  state: MetricState;
  /** Second line under the number, e.g. "24 active · 2 frozen". */
  hint?: ReactNode;
  /** Overrides the tone a settled value takes; loading and failure keep theirs. */
  tone?: StatTileTone;
  /** The console screens set their numbers at 26px, the dashboard at 22. */
  size?: "md" | "lg";
  /** Drops the frame: the audit header groups its counters in one panel. */
  bare?: boolean;
  className?: string;
};

const TONE: Record<StatTileTone, string> = {
  accent: "text-accent",
  fg: "text-fg",
  ok: "text-ok",
  warn: "text-warn",
  bad: "text-bad",
  muted: "text-muted",
};

/** One reading. No plot, so no hover layer — the number is the whole content. */
export function StatTile({
  label,
  state,
  hint,
  tone = "accent",
  size = "md",
  bare = false,
  className,
}: StatTileProps) {
  const valueTone =
    state.kind === "loading" ? "muted" : state.kind === "unavailable" ? "bad" : tone;

  return (
    <div
      className={cx(
        bare ? "" : "rounded-[11px] border border-line bg-panel",
        bare ? "" : size === "lg" ? "px-4.5 py-4" : "p-3.5",
        className,
      )}
    >
      <p className="m-0 font-mono text-[9px] uppercase tracking-[0.2em] text-muted">{label}</p>
      <p
        aria-label={readoutLabel(label, state)}
        className={cx(
          "m-0 font-mono",
          size === "lg" ? "mt-2.5 text-[26px] leading-none" : "mt-1.5 text-[22px]",
          TONE[valueTone],
        )}
      >
        {readout(state)}
      </p>
      {hint ? <p className="m-0 mt-1.5 text-[11px] text-dim">{hint}</p> : null}
    </div>
  );
}
