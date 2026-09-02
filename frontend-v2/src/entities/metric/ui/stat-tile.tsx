import { clsx as cx } from "clsx";
import { readout, readoutLabel, type MetricState } from "../model/metric";

export type StatTileProps = {
  label: string;
  state: MetricState;
  className?: string;
};

const TONE = {
  value: "text-accent",
  loading: "text-muted",
  unavailable: "text-bad",
} as const;

/** One reading. No plot, so no hover layer — the number is the whole content. */
export function StatTile({ label, state, className }: StatTileProps) {
  return (
    <div className={cx("rounded-[10px] border border-line bg-panel p-3.5", className)}>
      <p className="m-0 font-mono text-[9px] uppercase tracking-[0.24em] text-muted">{label}</p>
      <p
        aria-label={readoutLabel(label, state)}
        className={cx("m-0 mt-1.5 font-mono text-[22px]", TONE[state.kind])}
      >
        {readout(state)}
      </p>
    </div>
  );
}
