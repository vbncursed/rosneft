import { ActivityRow, type AuditEntry } from "@/entities/audit";
import { Callout } from "@/shared/ui/callout";
import { EmptyState } from "@/shared/ui/card";
import { Pager } from "@/shared/ui/pager";
import { Skeleton } from "@/shared/ui/skeleton";

export type ActivitySectionProps = {
  /**
   * The current page's rows, newest first as the gateway sent them — this
   * section does not re-sort and does not slice. null is "we could not find
   * out", never an empty history: every Guest lacks `audit:read_own` and gets
   * a 403 here, and reporting that as "nothing recorded" is a confident wrong
   * answer about the reader's own account.
   */
  entries: AuditEntry[] | null;
  page: number;
  pageCount: number;
  /** "1–6 of 184 events" — counted from the feed's total, not from the rows drawn. */
  summary: string;
  /** A page is on its way: the pager waits, and an empty slice draws skeletons rather than "nothing". */
  busy: boolean;
  onPage: (page: number) => void;
};

/** The caller's own journal, six rows a page: what they did, to what, and when. */
export function ActivitySection({ entries, page, pageCount, summary, busy, onPage }: ActivitySectionProps) {
  // One reading for the whole render, so two rows a millisecond apart cannot
  // land on different sides of midnight.
  const now = new Date();
  // An empty slice means three different things, and only `busy` and the page
  // count tell them apart: a page still on the wire, a page whose fetch failed
  // over a journal that demonstrably holds more, or a feed with nothing in it.
  const nothing = entries !== null && entries.length === 0;
  const waiting = busy && nothing;
  const stalled = !busy && nothing && pageCount > 1;
  const empty = !busy && nothing && pageCount <= 1;

  return (
    <section className="overflow-hidden rounded-card border border-line bg-panel">
      <div className="flex flex-wrap items-baseline gap-3 border-b border-line bg-panel-2 px-[22px] py-[18px]">
        <h2 className="m-0 text-[15px] font-semibold">My activity</h2>
        <span className="font-mono text-[10px] text-muted">newest first · 6 per page</span>
        <span aria-hidden="true" className="h-px min-w-5 flex-1 bg-line" />
      </div>

      {entries === null ? (
        <div className="p-[22px]">
          <Callout tone="warn">Your activity could not be loaded.</Callout>
        </div>
      ) : empty ? (
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
          {waiting ? (
            // One line per row the page will hold, so the footer keeps its
            // place while the rows land under it mid-walk.
            <div
              role="status"
              aria-busy="true"
              aria-label={`Loading page ${page}`}
              className="flex flex-col gap-3 px-[22px] py-3.5"
            >
              {["40%", "55%", "35%", "60%", "45%", "50%"].map((width) => (
                <Skeleton key={width} height="16px" width={width} />
              ))}
            </div>
          ) : stalled ? (
            // Never "nothing recorded": the journal holds more pages than this
            // one, and the footer stays so a chip gets the reader back to a
            // page that did load.
            <div className="p-[22px]">
              <Callout tone="warn">This page could not be loaded.</Callout>
            </div>
          ) : (
            <ul className="m-0 list-none p-0">
              {entries.map((entry) => (
                <ActivityRow key={entry.id} entry={entry} now={now} className="px-[22px] py-3.5" />
              ))}
            </ul>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-[22px] py-3.5">
            <span className="font-mono text-[10px] text-muted">{summary}</span>
            <Pager page={page} pageCount={pageCount} busy={busy} onPage={onPage} />
          </div>
        </>
      )}
    </section>
  );
}
