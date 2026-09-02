import { clsx as cx } from "clsx";
import { Badge } from "@/shared/ui/badge";
import { actorName, formatAt, type AuditEntry } from "../model/audit-entry";
import { eventKind, type EventKind } from "../model/event-kind";

export type EventCardProps = {
  entry: AuditEntry;
  /** One-line description of what moved, e.g. "4 fields changed". */
  summary: string;
  selected?: boolean;
  onSelect?: () => void;
};

const RAIL: Record<EventKind, string> = {
  create: "bg-ok",
  update: "bg-accent",
  delete: "bg-bad",
  auth: "bg-muted",
};

const ICON: Record<EventKind, string> = {
  create: "border-ok bg-ok-soft text-ok",
  update: "border-accent bg-accent-soft text-accent",
  delete: "border-bad bg-bad-soft text-bad",
  auth: "border-muted bg-transparent text-muted",
};

// Kept as text rather than icons: they read as the operators they are, and the
// kind is also carried by the rail, the ring and the accessible name.
const GLYPH: Record<EventKind, string> = {
  create: "+",
  update: "±",
  delete: "−",
  auth: "→",
};

const KIND_WORD: Record<EventKind, string> = {
  create: "created",
  update: "updated",
  delete: "deleted",
  auth: "authentication",
};

export function EventCard({ entry, summary, selected = false, onSelect }: EventCardProps) {
  const kind = eventKind(entry.action);
  const failed = entry.result === "failed";

  return (
    <article
      onClick={onSelect}
      aria-current={selected ? "true" : undefined}
      aria-label={`${entry.action}, ${KIND_WORD[kind]} ${entry.entityLabel}${failed ? ", failed" : ""}`}
      className={cx(
        "relative flex cursor-pointer items-start gap-3 overflow-hidden rounded-[11px] border py-3.5 pl-4.5 pr-4 transition-colors duration-150",
        selected ? "border-accent bg-accent-soft" : "border-line bg-panel-2 hover:border-line-2",
      )}
    >
      <span
        aria-hidden="true"
        className={cx("absolute inset-y-0 left-0 w-[3px]", RAIL[kind], !selected && "opacity-55")}
      />

      <span
        aria-hidden="true"
        className={cx(
          "flex size-[26px] shrink-0 items-center justify-center rounded-control border font-mono text-[13px] leading-none",
          ICON[kind],
        )}
      >
        {GLYPH[kind]}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-2.5">
          <span className="whitespace-nowrap font-mono text-xs text-accent">{entry.action}</span>
          <span className="min-w-0 truncate text-[13px] font-medium text-fg">
            {entry.entityLabel}
          </span>
          {failed ? (
            <Badge tone="bad" shape="tag" size="sm" className="tracking-[0.1em]">
              failed
            </Badge>
          ) : null}
        </div>
        <p className="m-0 mt-[5px] text-xs text-muted">{summary}</p>
      </div>

      <div className="flex min-w-0 items-center gap-3">
        <span className="truncate text-xs text-muted">{actorName(entry)}</span>
        <span className="w-11 text-right font-mono text-[11px] text-dim">
          {formatAt(entry.at).slice(11)}
        </span>
      </div>
    </article>
  );
}
