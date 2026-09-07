import type { AuditEntry } from "@/entities/audit";

/**
 * The second line of an activity row: what the action touched, and whether it
 * failed. The journal has no human-readable labels — the console prints the
 * action verbatim too — so this states facts rather than inventing prose.
 *
 * Empty when the row holds none of those three, and the row then draws no
 * second line. It used to fall back to `entity`, which is a table name: every
 * auth.* row the gateway writes carries entity "session" with an empty
 * entityId, entityLabel and territorySlug, so this feed printed fifty lines of
 * "session" under actions the reader could already see.
 */
export function summaryOf(entry: AuditEntry): string {
  const parts = [entry.entityLabel, entry.territorySlug];
  if (entry.result === "failed") parts.push("failed");
  return parts.filter(Boolean).join(" · ");
}

const pad = (n: number): string => String(n).padStart(2, "0");
const DAY_MS = 86_400_000;

/**
 * "09:14" today, "yesterday 18:20", "05.09 11:37" further back, in the
 * reader's own timezone.
 *
 * Local, not UTC — the console journal (`formatAt`, `entities/audit`) prints
 * the stored instant in UTC on purpose, because it shows that instant. This
 * shows only a relative label, so it follows the reader instead: an event ten
 * minutes ago must not read as yesterday because UTC rolled over. The two
 * screens differ deliberately; do not align one to the other.
 *
 * The day comparison is on the calendar date, not on elapsed milliseconds:
 * 23:50 and 00:10 are twenty minutes apart and still two different days, and a
 * month boundary must not turn yesterday into "older".
 */
export function relativeAt(at: string, now: Date): string {
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return "—";
  const clock = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const midnight = (x: Date): number => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((midnight(now) - midnight(d)) / DAY_MS);
  if (days <= 0) return clock;
  if (days === 1) return `yesterday ${clock}`;
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)} ${clock}`;
}

/**
 * "12 Aug 2026" — the day the two-factor card reports an enrolment on, in the
 * reader's own timezone, like every other time this screen prints. en-US
 * because en-GB abbreviates September as "Sept" and the mock's column is
 * three letters wide.
 */
export function dayOf(at: string): string {
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return "—";
  // Composed rather than taken whole from one locale: en-US orders it
  // "Aug 12, 2026" and en-GB abbreviates September as "Sept", and the mock
  // wants day-first with a three-letter month.
  return `${d.getDate()} ${d.toLocaleDateString("en-US", { month: "short" })} ${d.getFullYear()}`;
}
