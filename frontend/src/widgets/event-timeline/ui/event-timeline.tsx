import { EventCard, type AuditEntry } from "@/entities/audit";
import { SectionHeading } from "@/shared/ui/section-heading";

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
      <SectionHeading
        title={day}
        count={total === undefined ? undefined : `${total} events`}
        className="pb-1 pt-0.5"
      />

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
