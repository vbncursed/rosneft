import {
  alignSeries,
  formatValue,
  lastOf,
  PANELS,
  STAT_IDS,
  type AlertSummary,
  type MetricSeries,
  type PanelId,
  type ServiceHealth,
} from "@/entities/metric";
import { freeText, parseFilters } from "@/features/audit-filter";
import type { Detail } from "@/shared/ui/detail-list";
import type { MetricPanelEntry } from "@/widgets/metric-panels";
import type { MetricsPageStat } from "../ui/metrics-page";

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
export function matchesService(service: ServiceHealth, query: string): boolean {
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

/** One panel card: its catalogue entry, plus whatever its query has to say. */
export function panelEntry(id: PanelId, result: PanelResult): MetricPanelEntry {
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
  const last = lastOf(result.series);
  const tone = errorTone(id, last);
  return {
    key: id,
    title,
    meta,
    unit,
    last: formatValue(last, unit),
    ...(tone ? { lastTone: tone } : {}),
    series: alignSeries(result.series),
  };
}

const stat = (id: PanelId, result: PanelResult | undefined): string => {
  if (!result || result.kind === "loading") return "…";
  if (result.kind === "unavailable") return "—";
  return formatValue(lastOf(result.series), PANELS[id].unit);
};

/**
 * The five headline tiles. A tile with nothing behind it says so.
 *
 * `targetCount` is scrape targets, not service names: `stat-up` counts targets
 * and a replicated service is several of them, so counting names underneath it
 * printed "12" over "of 11 services".
 */
export function statsOf(
  results: Partial<Record<PanelId, PanelResult>>,
  targetCount: number | null,
): MetricsPageStat[] {
  const hints: Record<(typeof STAT_IDS)[number], string> = {
    "stat-up": targetCount === null ? "services answering" : `of ${targetCount} scraped targets`,
    "stat-rps": "per second · all HTTP",
    "stat-errors": "5xx share of HTTP",
    "stat-p99": "gRPC handling",
    "stat-queue": "conversion jobs waiting",
  };
  return STAT_IDS.map((id) => {
    const value = stat(id, results[id]);
    const bad = id === "stat-errors" && value !== "—" && value !== "…" && value !== "0%";
    return {
      label: PANELS[id].title,
      value,
      hint: hints[id],
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
