import { HttpError, httpGet, type ApiError } from "@/shared/api";
import type { components } from "@/shared/api/dto";
import type { AuditEntry } from "../model/audit-entry";
import type { Refs } from "../model/refs";
import { toAuditEntry } from "./to-audit-entry";

type AuditPageDto = components["schemas"]["AuditPage"];
type AuditActorDto = components["schemas"]["AuditActor"];

/** What the gateway filters on. `actor` is a user id, never a login. */
export type AuditFilters = {
  actor?: string;
  action?: string;
  entity?: string;
  from?: string;
  to?: string;
};
export type AuditActor = { id: string; login: string };
export type AuditPageResult = { entries: AuditEntry[]; nextCursor: number | null; refs: Refs };

const DEFAULT_LIMIT = 50;

/** Widens a calendar date to the edge of its day, in UTC, as the gateway compares instants. */
export const toBound = (date: string, edge: "from" | "to"): string =>
  `${date}T${edge === "from" ? "00:00:00" : "23:59:59"}Z`;

function toQuery(filters: AuditFilters, cursor: number | null, limit: number | null): string {
  const q = new URLSearchParams();
  for (const key of ["actor", "action", "entity", "from", "to"] as const) {
    const v = filters[key];
    if (v) q.set(key, v);
  }
  if (cursor !== null) q.set("cursor", String(cursor));
  if (limit !== null) q.set("limit", String(limit));
  const s = q.toString();
  return s ? `?${s}` : "";
}

/** One page of the company journal. A nextCursor of 0 or absent is the last page. */
export async function listAudit(
  filters: AuditFilters,
  cursor: number | null,
  limit = DEFAULT_LIMIT,
): Promise<AuditPageResult> {
  const page = await httpGet<AuditPageDto>(`/api/audit${toQuery(filters, cursor, limit)}`);
  return {
    entries: (page.entries ?? []).map(toAuditEntry),
    nextCursor: page.nextCursor && page.nextCursor > 0 ? page.nextCursor : null,
    refs: page.refs ?? {},
  };
}

export const listAuditActors = async (): Promise<AuditActor[]> =>
  ((await httpGet<AuditActorDto[] | null>("/api/audit/actors")) ?? []).map((a) => ({
    id: a.id,
    login: a.login ?? "",
  }));

/**
 * The same journal as CSV. A raw fetch: the client helper parses JSON, and a
 * plain <a download> would surface neither a filename nor a 403. Same
 * origin, so the session cookie rides along; no header is set.
 */
export async function exportAuditCsv(filters: AuditFilters): Promise<Blob> {
  const res = await fetch(`/api/audit.csv${toQuery(filters, null, null)}`);
  if (!res.ok) {
    // The gateway names the actual refusal ("audit:read required"); a bare
    // status code names nothing the operator can act on.
    let body: ApiError | null = null;
    try {
      body = (await res.json()) as ApiError;
    } catch {
      // not JSON
    }
    throw new HttpError(res.status, body, body?.message || `Export failed (${res.status})`);
  }
  return res.blob();
}
