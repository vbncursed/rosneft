import { useState } from "react";
import { useCurrentUser } from "@/auth/presentation/current-user-context";
import { useAuditActors } from "@/audit/application/use-audit-actors";
import { useAuditLog } from "@/audit/application/use-audit-log";
import { EMPTY_FILTERS, type AuditFilters } from "@/audit/domain/audit-entry";
import AuditFiltersBar from "@/audit/presentation/components/audit-filters";
import AuditTable from "@/audit/presentation/components/audit-table";
import ExportButton from "@/audit/presentation/components/export-button";

export default function AuditPanel() {
  const me = useCurrentUser();
  // Только для дропдауна фильтра: подписи в строках приходят внутри самих
  // записей, разрешённые сервером.
  const actors = useAuditActors();
  const [filters, setFilters] = useState<AuditFilters>(EMPTY_FILTERS);
  const { entries, isLoading, error, hasMore, loadMore, isLoadingMore } = useAuditLog(filters);

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Audit journal</h1>
          {/* States the scope plainly: a Company Owner should not wonder why a
              Root's change is missing from the list. */}
          <p className="mt-1 text-sm text-neutral-400">
            {me?.isOwner
              ? "Every change across the platform."
              : "Changes made by you and the accounts you created."}
          </p>
        </div>
        <ExportButton filters={filters} />
      </div>

      <div className="mt-6">
        <AuditFiltersBar value={filters} onChange={setFilters} actors={actors} />
      </div>

      <div className="mt-6">
        {error ? (
          <p className="rounded-2xl border border-rose-400/20 bg-rose-500/[0.06] px-4 py-3 text-sm text-rose-200">
            {error instanceof Error ? error.message : "Could not load the journal"}
          </p>
        ) : isLoading ? (
          <p className="text-sm text-neutral-500">Loading…</p>
        ) : (
          <AuditTable entries={entries} />
        )}
      </div>

      {hasMore ? (
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            onClick={() => void loadMore()}
            disabled={isLoadingMore}
            className="rounded-md border border-white/10 px-4 py-1.5 text-xs text-neutral-300 transition-colors hover:border-white/25 hover:text-white disabled:opacity-50"
          >
            {isLoadingMore ? "Loading…" : "Show more"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
