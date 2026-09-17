import {
  alignSeries,
  formatValue,
  lastOf,
  PANELS,
  STAT_IDS,
  type AlertSummary,
  type MetricSeries,
  type MetricState,
  type PanelId,
  type ServiceHealth,
} from "@/entities/metric";
import { freeText, parseFilters } from "@/features/audit-filter";
import type { Detail } from "@/shared/ui/detail-list";
import type { MetricPanelEntry } from "@/widgets/metric-panels";
import type { MetricsPageStat } from "../ui/metrics-page";
import { focusSeries, shortGrpcLabel } from "./focus";

/** What one panel query is in, as the screen reads it. */
export type PanelResult =
  | { kind: "loading" }
  | { kind: "value"; series: MetricSeries[] }
  | { kind: "unavailable"; message: string };

/**
 * The health list answers `service:` and `state:` and nothing else: free text
 * searches panel titles, and a key it cannot answer matches nothing rather
 * than everything, so a typo narrows the screen instead of silently widening
 * it.
 */
export function matchesServiceQuery(service: ServiceHealth, query: string): boolean {
  for (const { key, value } of parseFilters(query)) {
    if (key === "service") {
      if (!service.name.toLowerCase().includes(value.toLowerCase())) return false;
    } else if (key === "state") {
      if (service.state !== value) return false;
    } else if (key !== "group") {
      return false;
    }
  }
  return true;
}

/** `group:` picks sections; without one, every section stands. */
export function matchesSection(section: { key: string }, query: string): boolean {
  const groups = parseFilters(query).filter((f) => f.key === "group");
  return groups.length === 0 || groups.some((g) => g.value === section.key);
}

/** Free text searches panel titles; a chip is for the other two filters. */
export function matchesPanel(title: string, query: string): boolean {
  const text = freeText(query).trim().toLowerCase();
  return text === "" || title.toLowerCase().includes(text);
}

const errorTone = (id: PanelId, last: number | null) =>
  (id === "red-errors" || id === "stat-errors") && last !== null && last > 0
    ? ("bad" as const)
    : undefined;

/** Panels whose legends carry gRPC names to shorten. */
const GRPC_LABELLED: ReadonlySet<PanelId> = new Set<PanelId>(["red-rate", "red-errors", "red-latency"]);
/** Rate panels where an empty answer means a quiet window; a quantile with no samples is not "no traffic". */
const GRPC_QUIET: ReadonlySet<PanelId> = new Set<PanelId>(["red-rate", "red-errors"]);

/**
 * Panels whose PromQL is a `rate()`. A rate over a window with no samples is a
 * zero, not a missed scrape, so a gap in one of these is filled: leaving it
 * null breaks the line where nothing happened. Every other panel is a gauge or
 * a quantile, where a gap is a real gap and `alignSeries` must keep it.
 */
export const ZERO_FILLED: ReadonlySet<PanelId> = new Set<PanelId>([
  "red-rate",
  "red-errors",
  "red-http",
  "domain-conversions",
  "domain-upload",
  "domain-auth",
  "domain-twofa",
]);

/** One panel card: its catalogue entry, plus whatever its query has to say. */
export function panelEntry(
  id: PanelId,
  result: PanelResult,
  selected: string | null = null,
): MetricPanelEntry {
  const { title, meta, unit } = PANELS[id];
  if (result.kind === "loading") return { key: id, title, meta, unit, last: "…", series: [] };
  if (result.kind === "unavailable") {
    return {
      key: id,
      title,
      meta: `unavailable — ${result.message}`,
      unit,
      last: "—",
      lastTone: "bad",
      series: [],
    };
  }
  // A gRPC panel with nothing in it is a quiet window, not an outage — the red
  // "unavailable" wording above is for a panel that was actually refused.
  if (result.series.length === 0 && GRPC_QUIET.has(id)) {
    return {
      key: id,
      title,
      meta: "no gRPC traffic in range",
      unit,
      last: "—",
      lastTone: "dim",
      series: [],
    };
  }

  const focused = focusSeries(result.series, selected);
  const named = GRPC_LABELLED.has(id)
    ? focused.series.map((s) => ({ ...s, label: shortGrpcLabel(s.label) }))
    : focused.series;
  const last = lastOf(focused.series);
  const tone = errorTone(id, last);
  const aligned = alignSeries(named);
  return {
    key: id,
    title,
    meta: focused.hidden > 0 ? `${meta} · +${focused.hidden} more` : meta,
    unit,
    last: formatValue(last, unit),
    ...(tone ? { lastTone: tone } : {}),
    series: ZERO_FILLED.has(id)
      ? aligned.map((s) => ({ ...s, values: s.values.map((v) => v ?? 0) }))
      : aligned,
  };
}

const stat = (id: PanelId, result: PanelResult | undefined): MetricState => {
  if (!result || result.kind === "loading") return { kind: "loading" };
  if (result.kind === "unavailable") return { kind: "unavailable" };
  return { kind: "value", value: formatValue(lastOf(result.series), PANELS[id].unit) };
};

const HINTS: Record<(typeof STAT_IDS)[number], string> = {
  "stat-rps": "per second · all HTTP",
  "stat-errors": "5xx share of HTTP",
  "stat-p99": "gRPC handling",
  "stat-queue": "conversion jobs waiting",
};

/**
 * The four headline tiles. A tile with nothing behind it says which nothing it
 * is — "loading" and "unavailable" are different states, and a glyph tells a
 * screen reader neither. Services are counted by the meter beside these, not
 * by a tile: `stat-up` counts scrape targets, and printing that over a
 * denominator of service names read "12 of 11".
 */
export function statsOf(results: Partial<Record<PanelId, PanelResult>>): MetricsPageStat[] {
  return STAT_IDS.map((id) => {
    const state = stat(id, results[id]);
    const bad = id === "stat-errors" && state.kind === "value" && state.value !== "0%";
    return {
      label: PANELS[id].title,
      state,
      hint: HINTS[id],
      ...(bad ? { tone: "bad" as const } : {}),
    };
  });
}

/**
 * What the health list says when it holds no services. A failed `services-up`
 * panel is not an empty filter, and "No services match this filter." is a
 * sentence about a filter the reader did not apply.
 */
export function servicesHint(result: PanelResult | undefined): string | undefined {
  if (!result || result.kind === "loading") return "Service health is still loading.";
  if (result.kind === "unavailable") return `Service health is unavailable: ${result.message}`;
  return undefined;
}

const dash = (label: string, value: string): Detail =>
  value ? { label, value } : { label, value: "—", tone: "dim" };

/** What the inspector prints about the alert it is showing. */
export function alertDetails(a: AlertSummary): Detail[] {
  return [
    { label: "Alert", value: a.name },
    dash("Service", a.service),
    dash("Severity", a.severity),
    { label: "State", value: a.state, tone: a.state === "firing" ? "bad" : "warn" },
  ];
}
