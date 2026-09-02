/**
 * One journal row as the UI consumes it. oldRow/newRow are the raw snapshots;
 * the field-level diff is derived from them, never sent by the server.
 */
export type AuditEntry = {
  id: number;
  at: string;
  actorId: string;
  /** Empty when the actor was deleted — then the id is shown instead. */
  actorLogin: string;
  action: string;
  entity: string;
  entityId: string;
  entityLabel: string;
  oldRow: Record<string, unknown> | null;
  newRow: Record<string, unknown> | null;
  result: "ok" | "failed";
};

/** Nobody was behind this — a worker conversion, a migration. */
export const isSystemChange = (entry: AuditEntry) => entry.actorId === "";

/** Who to credit: the login, the bare id if the account is gone, or "system". */
export function actorName(entry: AuditEntry): string {
  if (isSystemChange(entry)) return "system";
  return entry.actorLogin || entry.actorId;
}

/** Trims the ISO instant to the minute the journal displays. */
export const formatAt = (at: string) => at.replace("T", " ").slice(0, 16);
