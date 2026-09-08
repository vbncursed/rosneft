import { ActivityRow, type AuditEntry } from "@/entities/audit";
import { Button } from "@/shared/ui/button";
import { Callout } from "@/shared/ui/callout";
import { EmptyState } from "@/shared/ui/card";

export type ActivitySectionProps = {
  /**
   * Newest first, as the gateway returned it — this section does not re-sort.
   * null is "we could not find out", never an empty history: every Guest lacks
   * `audit:read_own` and gets a 403 here, and reporting that as "nothing
   * recorded" is a confident wrong answer about the reader's own account.
   */
  entries: AuditEntry[] | null;
  /** The query reports another page. The only thing that draws "Show more". */
  hasMore: boolean;
  busy: boolean;
  onLoadMore: () => void;
};

/** The caller's own journal: what they did, to what, and when. */
export function ActivitySection({
  entries,
  hasMore,
  busy,
  onLoadMore,
}: ActivitySectionProps) {
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

      {entries === null ? (
        <div className="p-[22px]">
          <Callout tone="warn">Your activity could not be loaded.</Callout>
        </div>
      ) : entries.length === 0 ? (
        <div className="p-[22px]">
          {/* Not "signing in shows up here": the reader signed in to get to
              this page and auth.login is journalled, so that sentence is
              refuted by the screen it is printed on. */}
          <EmptyState
            title="Nothing to show yet"
            description="The journal returned no actions for this account. Anything you do from here appears as it happens."
          />
        </div>
      ) : (
        <>
          <ul className="m-0 list-none p-0">
            {entries.map((entry) => (
              <ActivityRow
                key={entry.id}
                entry={entry}
                now={now}
                className="px-[22px] py-3.5"
              />
            ))}
          </ul>
          <div className="flex flex-wrap items-center justify-between gap-3 px-[22px] py-3.5">
            <span className="font-mono text-[10px] text-muted">
              showing {entries.length} events
            </span>
            {/* Drawn off the query's own answer: a full last page would
                otherwise offer a page that does not exist. */}
            {hasMore ? (
              <Button
                size="sm"
                disabled={busy}
                loading={busy}
                onClick={onLoadMore}
              >
                Show more
              </Button>
            ) : null}
          </div>
        </>
      )}
    </section>
  );
}
