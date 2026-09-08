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
  /** Empty for a Root or system change. */
  companyId: string;
  /** The owning user's login behind companyId; empty under the same conditions as actorLogin. */
  companyLogin: string;
  action: string;
  entity: string;
  entityId: string;
  entityLabel: string;
  /** The parent territory's slug for placements, panoramas, documents and assignments; empty otherwise. */
  territorySlug: string;
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

/**
 * Trims the ISO instant to the minute the journal displays — in **UTC**, as
 * stored, which is the console journal's deliberate choice: it prints raw
 * instants and groups by them, so grouping locally would file an event under a
 * heading its own printed timestamp contradicts.
 *
 * `/account`'s feed makes the opposite choice for the opposite reason — see
 * `relativeAt` in `./relative-at`. It prints only a relative
 * label ("yesterday 18:20") with no raw instant beside it, so it uses the
 * reader's clock; an event ten minutes ago must not read as yesterday because
 * UTC has rolled over. Neither is a bug to "fix" into the other.
 */
export const formatAt = (at: string) => at.replace("T", " ").slice(0, 16);
