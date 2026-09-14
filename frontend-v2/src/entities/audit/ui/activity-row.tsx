import { clsx as cx } from "clsx";
import type { AuditEntry } from "../model/audit-entry";
import { relativeAt, summaryOf } from "../model/relative-at";

export type ActivityRowProps = {
  entry: AuditEntry;
  /** One reading per render of the list, so two rows a millisecond apart cannot straddle midnight. */
  now: Date;
  /** The row's padding — the account feed and Home space their rows differently. */
  className?: string;
};

/** One line of the caller's own journal: the action, what it touched, and when. */
export function ActivityRow({ entry, now, className }: ActivityRowProps) {
  // Empty for most auth rows, which carry no label, no territory and no
  // failure — the line is dropped rather than filled with the entity's table name.
  const summary = summaryOf(entry);
  return (
    <li className={cx("flex items-start gap-3 border-b border-line last:border-b-0", className)}>
      <div className="min-w-0 flex-1">
        <p className="m-0 truncate font-mono text-xs">{entry.action}</p>
        {summary ? <p className="m-0 mt-1 font-mono text-[10px] text-muted">{summary}</p> : null}
      </div>
      <span className="shrink-0 whitespace-nowrap font-mono text-[10px] text-muted">
        {relativeAt(entry.at, now)}
      </span>
    </li>
  );
}
