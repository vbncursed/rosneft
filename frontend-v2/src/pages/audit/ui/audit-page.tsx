import type { AuditEntry, Refs } from "@/entities/audit";
import { StatTile, type StatTileTone } from "@/entities/metric";
import { FilterBar, type ExtraFilter } from "@/features/audit-filter";
import { Button } from "@/shared/ui/button";
import { Badge } from "@/shared/ui/badge";
import type { Detail } from "@/shared/ui/detail-list";
import { Icon } from "@/shared/ui/icon";
import { Sparkline } from "@/shared/ui/sparkline";
import { EventTimeline, type TimelineEvent } from "@/widgets/event-timeline";
import { RecordInspector } from "@/widgets/record-inspector";

export type AuditDay = {
  key: string;
  /** e.g. "Today · 1 September". */
  label: string;
  events: TimelineEvent[];
  /** Total for the day, which may exceed what is loaded. */
  total?: number;
};

export type AuditCounter = {
  label: string;
  value: string;
  tone?: StatTileTone;
};

/** The record open in the inspector, with the facts the route resolved. */
export type InspectedRecord = {
  entry: AuditEntry;
  recordId: string;
  details: Detail[];
  /** Names for the ids inside the snapshots, merged from every loaded page. */
  refs?: Refs;
};

export type AuditPageProps = {
  days: AuditDay[];
  activity: { values: number[]; label: string; detail: string; dimFrom?: number };
  counters: AuditCounter[];

  query: string;
  onQueryChange: (query: string) => void;
  /** Chips the query text does not own — a date-range preset, say. */
  extraFilters?: ExtraFilter[];

  selectedId: number | null;
  onSelect: (id: number) => void;
  onCloseInspector: () => void;
  /** Absent while the selected record's detail is still loading. */
  inspected?: InspectedRecord | null;

  /** Whether the journal is following new events as they arrive. */
  live?: boolean;
  onExport: () => void;
  /** Whether an export is in flight — the button is busy and refuses a second. */
  exporting?: boolean;
  /** Refuses the export while the journal on screen is not what it would send. */
  exportDisabled?: boolean;
  onCopyJson: () => void;
  onOpenEntity?: () => void;
  /** Absent when the journal has reached its beginning. */
  onLoadOlder?: () => void;
  loadingOlder?: boolean;
};

// The five keys the gateway filters on. Free text is ignored, deliberately:
// there is no text search behind this and matching what is loaded would lie
// at page two.
const FILTER_PLACEHOLDER =
  "filter: entity:territory action:territory.update actor:a.ivanova from:2026-09-01 to:2026-09-02";

export function AuditPage({
  days,
  activity,
  counters,
  query,
  onQueryChange,
  extraFilters,
  selectedId,
  onSelect,
  onCloseInspector,
  inspected,
  live = false,
  onExport,
  exporting = false,
  exportDisabled = false,
  onCopyJson,
  onOpenEntity,
  onLoadOlder,
  loadingOlder = false,
}: AuditPageProps) {
  return (
    <>
      <header className="flex items-start justify-between gap-6">
        <div>
          <p className="m-0 font-mono text-[10px] uppercase tracking-[0.24em] text-accent">
            Append-only · tamper-evident
          </p>
          <h1 className="m-0 mt-2.5 text-[34px] font-bold tracking-[-0.025em]">Audit journal</h1>
        </div>

        <div className="flex items-center gap-2.5">
          {live ? (
            <Badge tone="ok" fill="soft" className="tracking-[0.12em]">
              <span aria-hidden="true" className="size-1.5 rounded-full bg-ok" />
              live
            </Badge>
          ) : null}
          <Button onClick={onExport} loading={exporting} disabled={exportDisabled}>
            <Icon name="download" size={15} />
            Export
          </Button>
        </div>
      </header>

      <FilterBar
        query={query}
        onChange={onQueryChange}
        extra={extraFilters}
        placeholder={FILTER_PLACEHOLDER}
      />

      <div className="flex items-end gap-5 rounded-card border border-line bg-panel px-4.5 py-4">
        <Sparkline
          className="min-w-0 flex-1"
          values={activity.values}
          label={activity.label}
          detail={activity.detail}
          dimFrom={activity.dimFrom}
        />
        <div className="flex gap-5.5 border-l border-line pl-5">
          {counters.map((counter) => (
            <StatTile
              key={counter.label}
              bare
              label={counter.label}
              state={{ kind: "value", value: counter.value }}
              tone={counter.tone ?? "fg"}
            />
          ))}
        </div>
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(420px,1fr)_minmax(280px,360px)]">
        <div className="flex flex-col gap-3">
          {days.map((day) => (
            <EventTimeline
              key={day.key}
              day={day.label}
              total={day.total}
              events={day.events}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          ))}

          {onLoadOlder ? (
            <Button
              shape="pill"
              className="self-center"
              onClick={onLoadOlder}
              loading={loadingOlder}
            >
              Load older events
            </Button>
          ) : null}
        </div>

        {inspected ? (
          // Sticky so the record stays readable while the journal scrolls.
          <div className="xl:sticky xl:top-6">
            <RecordInspector
              entry={inspected.entry}
              refs={inspected.refs}
              recordId={inspected.recordId}
              details={inspected.details}
              onCopyJson={onCopyJson}
              onOpenEntity={onOpenEntity}
              onClose={onCloseInspector}
            />
          </div>
        ) : null}
      </div>
    </>
  );
}
