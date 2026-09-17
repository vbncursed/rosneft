import { ActivityRow, type AuditEntry } from "@/entities/audit";
import { Callout } from "@/shared/ui/callout";
import { EmptyState } from "@/shared/ui/card";
import { SectionHeading } from "@/shared/ui/section-heading";
import { Skeleton } from "@/shared/ui/skeleton";
import { TrailingLink } from "./trailing-link";

export type ActivitySectionProps = {
  /** null is "we could not find out" — a Guest's 403 on /api/audit/mine. */
  entries: AuditEntry[] | null;
  loading: boolean;
};

/** The reader's own journal, four rows deep. */
export function ActivitySection({ entries, loading }: ActivitySectionProps) {
  // One reading for the whole list, so two rows a millisecond apart cannot straddle midnight.
  const now = new Date();
  const body = loading ? (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading your activity"
      className="flex flex-col gap-2 p-[17px]"
    >
      <Skeleton height="16px" width="40%" />
      <Skeleton height="16px" width="55%" />
    </div>
  ) : entries === null ? (
    <div className="p-[22px]">
      <Callout tone="warn">Your activity could not be loaded.</Callout>
    </div>
  ) : (
    <ul role="list" className="m-0 list-none p-0">
      {entries.map((entry) => (
        <ActivityRow key={entry.id} entry={entry} now={now} className="px-[17px] py-[13px]" />
      ))}
    </ul>
  );

  return (
    <section aria-label="Your recent activity">
      <SectionHeading
        title="Your recent activity"
        count="newest first"
        className="pb-3 pt-0.5"
        trailing={<TrailingLink href="/account">Open account →</TrailingLink>}
      />
      {entries !== null && !loading && entries.length === 0 ? (
        // Its own dashed card, never inside the bordered container — an
        // override class on EmptyState would be a clsx collision.
        <EmptyState
          layout="start"
          title="No activity yet"
          description="Your actions will show up here."
        />
      ) : (
        <div className="overflow-hidden rounded-[12px] border border-line bg-panel">{body}</div>
      )}
    </section>
  );
}
