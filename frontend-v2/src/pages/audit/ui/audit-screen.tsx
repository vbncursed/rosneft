import { leaveTo } from "@/shared/lib/leave";
import { Callout } from "@/shared/ui/callout";
import { DatePicker } from "@/shared/ui/date-picker";
import { Skeleton } from "@/shared/ui/skeleton";
import {
  activityOf,
  countersOf,
  entityHref,
  groupByDay,
  inspectorDetails,
  rangeChip,
} from "../model/journal";
import { useAudit } from "../model/use-audit";
import { AuditPage } from "./audit-page";

const CAPTION = "shrink-0 font-mono text-[9px] uppercase tracking-[0.18em] text-muted";

/** Maps the container onto the page and draws the date pickers beside it. */
export function AuditScreen() {
  const s = useAudit();

  if (s.status === "loading") {
    return (
      <div
        role="status"
        aria-busy="true"
        aria-label="Loading journal"
        className="flex flex-col gap-3"
      >
        <Skeleton height="28px" width="30%" />
        <Skeleton height="96px" />
        <Skeleton height="96px" />
      </div>
    );
  }
  if (s.status === "unavailable" || !s.window) {
    return <Callout tone="bad">The journal is unavailable: {s.error}</Callout>;
  }

  const now = new Date();
  const refused = !!s.unknownActor || s.backwardsRange;
  const days = refused ? [] : groupByDay(s.entries, now);
  const href = s.selected ? entityHref(s.selected) : null;
  const chip = rangeChip(s.range);

  return (
    <>
      {/* An empty list answers with a sentence: the page draws nothing at all
          between the strip and the inspector when it has no days. */}
      {s.unknownActor ? (
        <Callout tone="warn">No actor named {s.unknownActor}.</Callout>
      ) : s.backwardsRange ? (
        <Callout tone="warn">That range ends before it starts.</Callout>
      ) : days.length === 0 ? (
        <Callout tone="accent" icon="search">
          No events match this filter.
        </Callout>
      ) : null}

      <AuditPage
        days={days}
        activity={activityOf(s.window.entries, now, s.window.capped)}
        counters={countersOf(s.window.entries, s.window.capped, s.actors.length)}
        query={s.query}
        onQueryChange={s.setQuery}
        extraFilters={chip ? [{ label: chip, onRemove: () => s.setRange({ from: "", to: "" }) }] : []}
        filterTrailing={
          // The pickers are the screen's, not the page's: the page stays
          // chrome-free and only receives the chip. The captions are `Field`'s
          // overline by hand — `Field` ties its <label> to a control id, and
          // `DatePicker` has no id to give it; a plain <span> also leaves the
          // trigger's accessible name the only "From" on the screen.
          <>
            <span className={CAPTION}>From</span>
            <DatePicker
              label="From"
              value={s.range.from}
              onChange={(from) => s.setRange({ ...s.range, from })}
            />
            <span className={CAPTION}>To</span>
            <DatePicker
              label="To"
              value={s.range.to}
              onChange={(to) => s.setRange({ ...s.range, to })}
            />
          </>
        }
        selectedId={s.selected?.id ?? null}
        onSelect={s.select}
        onCloseInspector={() => s.select(null)}
        inspected={
          s.selected && {
            entry: s.selected,
            recordId: String(s.selected.id),
            details: inspectorDetails(s.selected),
            refs: s.refs,
          }
        }
        live={s.live}
        onExport={s.exportCsv}
        exporting={s.exporting}
        exportDisabled={refused}
        onCopyJson={s.copyJson}
        onOpenEntity={href ? () => leaveTo(href) : undefined}
        onLoadOlder={s.loadOlder}
        loadingOlder={s.loadingOlder}
      />
    </>
  );
}
