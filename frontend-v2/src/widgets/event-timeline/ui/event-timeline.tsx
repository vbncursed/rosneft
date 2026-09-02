import { EventCard, type AuditEntry } from "@/entities/audit";

export type TimelineEvent = {
  entry: AuditEntry;
  /** One line on what moved, e.g. "4 fields changed". */
  summary: string;
};

export type EventTimelineProps = {
  /** Heading for the group, e.g. "Today · 1 September". */
  day: string;
  events: TimelineEvent[];
  /** Total for the day, which may exceed what is loaded. */
  total?: number;
  selectedId?: number | null;
  onSelect?: (id: number) => void;
};

export function EventTimeline({
  day,
  events,
  total,
  selectedId = null,
  onSelect,
}: EventTimelineProps) {
  return (
    <section aria-label={day} className="flex flex-col gap-3">
      <div className="flex items-center gap-3 pb-1 pt-0.5">
        <h2 className="m-0 text-[13px] font-semibold text-fg">{day}</h2>
        {total !== undefined ? (
          <span className="font-mono text-[10px] text-dim">{total} events</span>
        ) : null}
        <span aria-hidden="true" className="h-px flex-1 bg-line" />
      </div>

      {events.length === 0 ? (
        <p className="m-0 rounded-control border border-dashed border-line-2 px-3 py-[9px] text-[11px] text-muted">
          Nothing happened on this day.
        </p>
      ) : (
        events.map(({ entry, summary }) => (
          <EventCard
            key={entry.id}
            entry={entry}
            summary={summary}
            selected={entry.id === selectedId}
            onSelect={onSelect ? () => onSelect(entry.id) : undefined}
          />
        ))
      )}
    </section>
  );
}
