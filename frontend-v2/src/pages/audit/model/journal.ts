import {
  actorName,
  diffRows,
  formatAt,
  toBound,
  type AuditActor,
  type AuditEntry,
  type AuditFilters,
} from "@/entities/audit";
import { parseFilters } from "@/features/audit-filter";
import type { Detail } from "@/shared/ui/detail-list";
import type { AuditCounter, AuditDay, AuditPageProps } from "../ui/audit-page";

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const WINDOW_LIMIT = 200;

export type DateRange = { from: string; to: string };

/**
 * The five keys the gateway filters on; free text and unknown keys are not
 * sent. The picked range fills a bound no token names — a token wins because
 * it is the one the reader can see in the query.
 */
export function parseAuditFilters(
  query: string,
  actors: AuditActor[],
  range: DateRange = { from: "", to: "" },
): { filters: AuditFilters; unknownActor: string | null } {
  const filters: AuditFilters = {};
  if (range.from) filters.from = toBound(range.from, "from");
  if (range.to) filters.to = toBound(range.to, "to");
  let unknownActor: string | null = null;
  for (const { key, value } of parseFilters(query)) {
    if (key === "entity") filters.entity = value;
    else if (key === "action") filters.action = value;
    else if (key === "from") filters.from = toBound(value, "from");
    else if (key === "to") filters.to = toBound(value, "to");
    else if (key === "actor") {
      const actor = actors.find((a) => a.login === value);
      if (actor) filters.actor = actor.id;
      else unknownActor = value;
    }
  }
  return { filters: unknownActor ? {} : filters, unknownActor };
}

// Everything on this screen reads the journal in UTC — `formatAt` prints the
// stored instant as it is — so a day, an hour and a chip are all UTC too.
// Grouping by the reader's local date would file an event under a heading its
// own printed timestamp contradicts.
const utc = (iso: string, options: Intl.DateTimeFormatOptions, locale = "en-GB") =>
  new Date(iso).toLocaleDateString(locale, { ...options, timeZone: "UTC" });

// en-GB abbreviates September as "Sept"; en-US does not, and the design's chip
// is three letters wide.
const shortDay = (iso: string) =>
  `${Number(iso.slice(8, 10))} ${utc(`${iso}T00:00:00Z`, { month: "short" }, "en-US")}`;

/** The chip for a picked range; null when nothing is picked. */
export function rangeChip(range: DateRange): string | null {
  if (range.from && range.to) return `${shortDay(range.from)} – ${shortDay(range.to)}`;
  if (range.from) return `from ${shortDay(range.from)}`;
  if (range.to) return `until ${shortDay(range.to)}`;
  return null;
}

const dayKey = (d: Date) => d.toISOString().slice(0, 10);

function dayLabel(d: Date, now: Date): string {
  const long = utc(d.toISOString(), { day: "numeric", month: "long" });
  const key = dayKey(d);
  if (key === dayKey(now)) return `Today · ${long}`;
  if (key === dayKey(new Date(now.getTime() - DAY_MS))) return `Yesterday · ${long}`;
  return d.getUTCFullYear() === now.getUTCFullYear() ? long : `${long} ${d.getUTCFullYear()}`;
}

export function summaryOf(entry: AuditEntry): string {
  if (entry.result === "failed") return "failed";
  if (entry.action.startsWith("auth.")) return entry.action.slice("auth.".length);
  const verb = entry.action.split(".").pop();
  if (verb === "insert") return "created";
  if (verb === "delete") return "deleted";
  const n = diffRows(entry.oldRow, entry.newRow).length;
  return `${n} ${n === 1 ? "field" : "fields"} changed`;
}

/** Newest day first, entries in the order the journal sent them (descending id). */
export function groupByDay(entries: AuditEntry[], now = new Date()): AuditDay[] {
  const days = new Map<string, AuditDay>();
  for (const entry of entries) {
    const d = new Date(entry.at);
    const key = dayKey(d);
    const day = days.get(key) ?? { key, label: dayLabel(d, now), events: [] };
    day.events.push({ entry, summary: summaryOf(entry) });
    days.set(key, day);
  }
  return [...days.values()];
}

/**
 * The 24-hour window's lower bound, rounded down to the running hour: a bound
 * that moved with the clock would mint a new query key on every render, and a
 * bound captured once would drift on a tab left open all day. It advances once
 * an hour, which is the resolution the strip plots anyway.
 */
export const windowStart = (now = new Date()): string =>
  new Date(Math.floor(now.getTime() / HOUR_MS) * HOUR_MS - DAY_MS).toISOString();

const hourOf = (now: Date, i: number) => new Date(now.getTime() - (23 - i) * HOUR_MS);

/** 24 buckets, oldest first; the last is the hour still running. */
export function activityOf(
  entries: AuditEntry[],
  now: Date,
  capped: boolean,
): AuditPageProps["activity"] {
  const values = Array.from({ length: 24 }, () => 0);
  const startOf = (d: Date) => Math.floor(d.getTime() / HOUR_MS);
  const firstHour = startOf(hourOf(now, 0));
  for (const e of entries) {
    const i = startOf(new Date(e.at)) - firstHour;
    if (i >= 0 && i < 24) values[i] += 1;
  }
  const peak = Math.max(...values);
  const at = hourOf(now, values.indexOf(peak));
  const detail = capped
    ? `from ${WINDOW_LIMIT} loaded events`
    : `peak ${peak}/h at ${String(at.getUTCHours()).padStart(2, "0")}:00`;
  return { values, label: "Events · last 24h (UTC)", detail, dimFrom: 23 };
}

export function countersOf(
  entries: AuditEntry[],
  capped: boolean,
  actorCount: number,
): AuditCounter[] {
  const failed = entries.filter((e) => e.result === "failed").length;
  return [
    { label: "Events · 24h", value: capped ? `${WINDOW_LIMIT}+` : String(entries.length) },
    { label: "Failed · 24h", value: String(failed), ...(failed > 0 ? { tone: "bad" as const } : {}) },
    { label: "Actors", value: String(actorCount), tone: "accent" },
  ];
}

const dash = (label: string, value: string): Detail =>
  value ? { label, value } : { label, value: "—", tone: "dim" };

export function inspectorDetails(entry: AuditEntry): Detail[] {
  return [
    { label: "Actor", value: actorName(entry) },
    { label: "At", value: formatAt(entry.at) },
    dash("Company", entry.companyLogin || entry.companyId),
    dash("Territory", entry.territorySlug),
    { label: "Result", value: entry.result, tone: entry.result === "failed" ? "bad" : "ok" },
  ];
}

/** The old SPA's viewer for a territory or model that still exists. */
export function entityHref(entry: AuditEntry): string | null {
  if (!entry.entityLabel || entry.action.endsWith(".delete")) return null;
  if (entry.entity === "territory") return `/territories/${encodeURIComponent(entry.entityLabel)}`;
  if (entry.entity === "model") return `/models/${encodeURIComponent(entry.entityLabel)}`;
  return null;
}
