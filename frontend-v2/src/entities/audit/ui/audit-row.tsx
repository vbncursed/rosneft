import { clsx as cx } from "clsx";
import { Badge } from "@/shared/ui/badge";
import { actorName, formatAt, type AuditEntry } from "../model/audit-entry";
import { DiffView } from "./diff-view";

export type AuditRowProps = {
  entry: AuditEntry;
  expanded: boolean;
  onToggle: () => void;
};

export function AuditRow({ entry, expanded, onToggle }: AuditRowProps) {
  return (
    <div className={cx(expanded && "bg-panel-2")}>
      <div className="grid grid-cols-[150px_1fr_110px_60px] items-baseline gap-3 border-b border-line px-4.5 py-3">
        <span className="font-mono text-[11px] text-dim">{formatAt(entry.at)}</span>

        <span className="text-[13px]">
          <span className="font-mono text-accent">{entry.action}</span>{" "}
          <span aria-hidden="true" className="text-dim">
            ·
          </span>{" "}
          {entry.entityLabel}
        </span>

        <span className="text-xs text-muted">{actorName(entry)}</span>

        <span className="flex justify-end gap-1.5">
          {entry.result === "failed" ? (
            <Badge tone="bad" shape="tag" size="sm">
              failed
            </Badge>
          ) : null}
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            className="cursor-pointer border-none bg-transparent p-0 font-mono text-[10px] uppercase text-muted transition-colors duration-150 hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            diff
          </button>
        </span>
      </div>

      {expanded ? (
        <div className="border-b border-line bg-panel-2 px-4.5 py-3.5">
          <DiffView before={entry.oldRow} after={entry.newRow} />
        </div>
      ) : null}
    </div>
  );
}
