import { httpGet } from "@/shared/infrastructure/http/client";
import type { AuditEntry, AuditFilters } from "@/audit/domain/audit-entry";

type AuditEntryDto = {
  id: number;
  at: string;
  actorId?: string;
  companyId?: string;
  action: string;
  entity: string;
  entityId?: string;
  entityLabel?: string;
  oldRow?: string;
  newRow?: string;
  result: string;
};

type AuditPageDto = { entries: AuditEntryDto[]; nextCursor?: number };

export type AuditPage = { entries: AuditEntry[]; nextCursor: number | null };

// The server sends the snapshots as raw JSON text so it never has to agree with
// the client on any row's shape. A malformed one degrades to null rather than
// taking the page down — who/when/what stays readable even then.
function parseRow(raw: string | undefined): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function toEntry(dto: AuditEntryDto): AuditEntry {
  return {
    id: dto.id,
    at: dto.at,
    actorId: dto.actorId ?? "",
    companyId: dto.companyId ?? "",
    action: dto.action,
    entity: dto.entity,
    entityId: dto.entityId ?? "",
    entityLabel: dto.entityLabel ?? "",
    oldRow: parseRow(dto.oldRow),
    newRow: parseRow(dto.newRow),
    result: dto.result === "failed" ? "failed" : "ok",
  };
}

// <input type="date"> yields "2026-07-28"; the API takes RFC3339. Widening the
// bounds to the whole day is what a reader means by "from the 28th to the 28th"
// — sending the bare date would be rejected, and midnight-to-midnight would
// silently drop everything that happened on the closing day.
function toBound(date: string, edge: "start" | "end"): string {
  if (!date || date.includes("T")) return date;
  return edge === "start" ? `${date}T00:00:00Z` : `${date}T23:59:59Z`;
}

function toQuery(filters: AuditFilters, cursor: number | null): string {
  const params = new URLSearchParams();
  if (filters.actor) params.set("actor", filters.actor);
  if (filters.action) params.set("action", filters.action);
  if (filters.entity) params.set("entity", filters.entity);
  if (filters.from) params.set("from", toBound(filters.from, "start"));
  if (filters.to) params.set("to", toBound(filters.to, "end"));
  if (cursor !== null) params.set("cursor", String(cursor));
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export async function fetchAuditPage(
  filters: AuditFilters,
  cursor: number | null,
): Promise<AuditPage> {
  const dto = await httpGet<AuditPageDto>(`/api/audit${toQuery(filters, cursor)}`);
  return {
    entries: dto.entries.map(toEntry),
    nextCursor: dto.nextCursor && dto.nextCursor > 0 ? dto.nextCursor : null,
  };
}

// A plain link, not a fetch: the browser handles the download, and the CSV route
// is streamed rather than buffered. The bearer token is not in the URL, so this
// relies on the same-session cookie-less flow the rest of the console uses —
// see export-button, which fetches with the header and blobs the result.
export function auditCsvPath(filters: AuditFilters): string {
  return `/api/audit.csv${toQuery(filters, null)}`;
}
