import type { AuditEntry } from "@/entities/audit";
import { Button } from "@/shared/ui/button";
import { EmptyState } from "@/shared/ui/card";
import { relativeAt, summaryOf } from "../model/activity";

export type ActivitySectionProps = {
  /** Newest first, as the gateway returned it — this section does not re-sort. */
  entries: AuditEntry[];
  /** The query reports another page. The only thing that draws "Show more". */
  hasMore: boolean;
  busy: boolean;
  onLoadMore: () => void;
};

/** The caller's own journal: what they did, to what, and when. */
export function ActivitySection({ entries, hasMore, busy, onLoadMore }: ActivitySectionProps) {
  // One reading for the whole render, so two rows a millisecond apart cannot
  // land on different sides of midnight.
  const now = new Date();

  return (
    <section className="overflow-hidden rounded-card border border-line bg-panel">
      <div className="flex flex-wrap items-baseline gap-3 border-b border-line bg-panel-2 px-[22px] py-[18px]">
        <h2 className="m-0 text-[15px] font-semibold">My activity</h2>
        <span className="font-mono text-[10px] text-muted">
          everything recorded under your account, newest first
        </span>
        <span aria-hidden="true" className="h-px min-w-5 flex-1 bg-line" />
      </div>

      {entries.length === 0 ? (
        <div className="p-[22px]">
          <EmptyState
            title="Nothing recorded yet"
            description="Signing in, changing a password or uploading a territory all show up here."
          />
        </div>
      ) : (
        <>
          <ul className="m-0 list-none p-0">
            {entries.map((entry) => (
              <li
                key={entry.id}
                className="flex items-start gap-3 border-b border-line px-[22px] py-3.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="m-0 font-mono text-xs">{entry.action}</p>
                  <p className="m-0 mt-1 font-mono text-[10px] text-muted">{summaryOf(entry)}</p>
                </div>
                <span className="whitespace-nowrap font-mono text-[10px] text-muted">
                  {relativeAt(entry.at, now)}
                </span>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center justify-between gap-3 px-[22px] py-3.5">
            <span className="font-mono text-[10px] text-muted">showing {entries.length} events</span>
            {/* Drawn off the query's own answer: a full last page would
                otherwise offer a page that does not exist. */}
            {hasMore ? (
              <Button size="sm" disabled={busy} loading={busy} onClick={onLoadMore}>
                Show more
              </Button>
            ) : null}
          </div>
        </>
      )}
    </section>
  );
}
