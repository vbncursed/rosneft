import { clsx as cx } from "clsx";
import type { AlertSeverity } from "../model/metric";

export type AlertRowProps = {
  /** What fired, e.g. "HighErrorRate · gateway". */
  name: string;
  severity: AlertSeverity;
};

const SKIN: Record<AlertSeverity, string> = {
  firing: "border-bad bg-bad-soft text-bad",
  pending: "border-warn bg-warn-soft text-warn",
};

/** Severity always ships with its word, never as colour alone. */
export function AlertRow({ name, severity }: AlertRowProps) {
  return (
    <div
      className={cx(
        "flex items-center justify-between gap-3 rounded-control border px-3 py-2",
        SKIN[severity],
      )}
    >
      <span className="text-xs">{name}</span>
      <span className="font-mono text-[9px] uppercase tracking-[0.2em]">{severity}</span>
    </div>
  );
}
