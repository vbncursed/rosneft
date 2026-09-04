import { useInfiniteQuery, useMutation, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  auditActorsQuery,
  auditQuery,
  auditWindowQuery,
  exportAuditCsv,
  type AuditActor,
  type AuditEntry,
  type AuditFilters,
  type Refs,
} from "@/entities/audit";
import { messageOf } from "@/shared/api";
import { saveBlob } from "@/shared/lib/download";
import { notify } from "@/shared/lib/notify";
import { unanswered } from "@/shared/lib/unanswered";
import { parseAuditFilters, windowStart, type DateRange } from "./journal";

export type AuditState = {
  status: "loading" | "ready" | "unavailable";
  error: string | null;
  entries: AuditEntry[];
  refs: Refs;
  actors: AuditActor[];
  window: { entries: AuditEntry[]; capped: boolean } | null;
  query: string;
  setQuery: (query: string) => void;
  range: DateRange;
  setRange: (range: DateRange) => void;
  filters: AuditFilters;
  unknownActor: string | null;
  selected: AuditEntry | null;
  select: (id: number | null) => void;
  live: boolean;
  /** Absent once the journal has reached its beginning. */
  loadOlder?: () => void;
  loadingOlder: boolean;
  exportCsv: () => void;
  exporting: boolean;
  copyJson: () => void;
};

const WINDOW_LIMIT = 200;

/**
 * Everything the Audit screen decides. The journal is an infinite query keyed
 * by the parsed filters; the 24-hour window and the actors are their own
 * queries so a filter never changes the counters above the list.
 */
export function useAudit(): AuditState {
  const [query, setQuery] = useState("");
  const [range, setRange] = useState<DateRange>({ from: "", to: "" });
  const [selectedId, setSelectedId] = useState<number | null>(null);
  // Rounded to the hour inside windowStart, so this is stable across renders
  // and advances once an hour — a value captured at mount would go stale on a
  // tab left open all day.
  const from = windowStart();

  const actors = useQuery(auditActorsQuery);
  const { filters, unknownActor } = useMemo(
    () => parseAuditFilters(query, actors.data ?? [], range),
    [query, actors.data, range],
  );
  // Disabled until the actors are in: `actor:<login>` resolves through them,
  // and an unknown login must send nothing rather than the whole journal.
  const journal = useInfiniteQuery({
    ...auditQuery(filters),
    enabled: unknownActor === null && !!actors.data,
  });
  const window = useQuery(auditWindowQuery(from));

  const entries = journal.data?.pages.flatMap((page) => page.entries) ?? [];
  const refs = Object.assign({}, ...(journal.data?.pages.map((page) => page.refs) ?? [])) as Refs;

  const exporting = useMutation({
    mutationFn: () => exportAuditCsv(filters),
    onSuccess: (blob) => saveBlob(blob, "audit.csv"),
    onError: (err) => notify.error(messageOf(err, "Export failed")),
  });

  const selected = entries.find((entry) => entry.id === selectedId) ?? null;
  const failed = unanswered(journal) ?? unanswered(actors) ?? unanswered(window);
  // isLoading, not isPending: a disabled query stays pending forever, and the
  // journal is disabled while the actors load or the actor is unknown.
  const loading = journal.isLoading || actors.isPending || window.isPending;

  return {
    status: loading ? "loading" : failed ? "unavailable" : "ready",
    error: failed ? messageOf(failed) : null,
    entries,
    refs,
    actors: actors.data ?? [],
    window: window.data
      ? { entries: window.data.entries, capped: window.data.entries.length >= WINDOW_LIMIT }
      : null,
    query,
    setQuery,
    range,
    setRange,
    filters,
    unknownActor,
    selected,
    select: setSelectedId,
    live: (journal.data?.pages.length ?? 0) <= 1 && unknownActor === null,
    ...(journal.hasNextPage ? { loadOlder: () => void journal.fetchNextPage() } : {}),
    loadingOlder: journal.isFetchingNextPage,
    exportCsv: () => exporting.mutate(),
    exporting: exporting.isPending,
    copyJson: () => {
      if (!selected) return;
      void navigator.clipboard.writeText(JSON.stringify(selected, null, 2)).then(
        () => notify.success("Copied"),
        () => notify.error("Could not copy"),
      );
    },
  };
}
