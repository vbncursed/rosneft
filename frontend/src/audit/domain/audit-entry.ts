// AuditEntry is one journal row as the UI consumes it. oldRow/newRow are the
// raw snapshots; the field-level diff is derived by diffRows, never sent by the
// server — it is fully determined by the two snapshots.
export type AuditEntry = {
  id: number;
  at: string;
  actorId: string;
  companyId: string;
  action: string;
  entity: string;
  entityId: string;
  entityLabel: string;
  oldRow: Record<string, unknown> | null;
  newRow: Record<string, unknown> | null;
  result: "ok" | "failed";
};

// AuditFilters mirrors the gateway's query parameters. An empty string means
// "no filter" for every field. The company scope is deliberately absent: it
// comes from the session, and the server ignores any attempt to set it.
export type AuditFilters = {
  actor: string;
  action: string;
  entity: string;
  from: string;
  to: string;
};

export const EMPTY_FILTERS: AuditFilters = {
  actor: "",
  action: "",
  entity: "",
  from: "",
  to: "",
};

// isSystemChange reports whether nobody was behind an entry — a mesh-worker
// conversion, a migration. The UI labels these rather than showing a blank
// actor, which would read as missing data.
export function isSystemChange(entry: AuditEntry): boolean {
  return entry.actorId === "";
}
