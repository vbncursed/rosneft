import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  ALL_PANELS,
  alertsOf,
  panelsQuery,
  servicesOf,
  type AlertSummary,
  type MetricsRange,
  type PanelId,
  type PanelSeries,
  type ServiceHealth,
} from "@/entities/metric";
import { messageOf } from "@/shared/api";
import { unanswered } from "@/shared/lib/unanswered";
import type { PanelResult } from "./dashboard";

const NO_ANSWER = "Prometheus did not answer";

type Kept = { range: MetricsRange; answer: PanelSeries | undefined; series: PanelSeries };

/**
 * A panel the gateway left out of an answered map failed on its own. One it
 * answered on an earlier tick keeps those series, marked stale, so a
 * transient failure does not flicker the card dark; one never answered is a
 * dark card.
 */
export const resultOf = (data: PanelSeries | undefined, kept: PanelSeries, id: PanelId): PanelResult => {
  if (!data) return { kind: "loading" };
  const series = data[id];
  if (series) return { kind: "value", series };
  const old = kept[id];
  return old ? { kind: "value", series: old, stale: true } : { kind: "unavailable", message: NO_ANSWER };
};

export type MetricsState = {
  status: "loading" | "ready" | "unavailable";
  error: string | null;
  results: Partial<Record<PanelId, PanelResult>>;
  services: ServiceHealth[];
  alerts: AlertSummary[];
  /** null when the alerts panel failed: unknown is not zero. */
  firingCount: number | null;
  query: string;
  setQuery: (q: string) => void;
  selectedService: string | null;
  selectService: (name: string | null) => void;
  selectedPanel: string | null;
  selectPanel: (key: string | null) => void;
  alertOpen: boolean;
  setAlertOpen: (open: boolean) => void;
};

/**
 * Everything the Metrics screen decides. One query for every panel, keyed on
 * the range the route holds; a panel this tick left out keeps its last series,
 * marked stale, a panel never answered is one dark card, and only a request
 * that never answered makes the dashboard unavailable.
 */
export function useMetrics(range: MetricsRange): MetricsState {
  const [query, setQuery] = useState("");
  const [selectedService, selectService] = useState<string | null>(null);
  const [selectedPanel, selectPanel] = useState<string | null>(null);
  const [alertOpen, setAlertOpen] = useState(true);

  const panels = useQuery(panelsQuery(range));
  const failed = unanswered(panels);
  // The last series each panel answered with, for this range only — folded in
  // while rendering (React's "adjust state on a prop change"), so the tick
  // that drops a panel already draws it stale rather than dark for a frame.
  const [kept, setKept] = useState<Kept>({ range, answer: undefined, series: {} });
  if (panels.data && (kept.answer !== panels.data || kept.range !== range)) {
    const earlier = kept.range === range ? kept.series : {};
    setKept({ range, answer: panels.data, series: { ...earlier, ...panels.data } });
  }
  const keptSeries = kept.range === range ? kept.series : {};
  const results = Object.fromEntries(ALL_PANELS.map((id) => [id, resultOf(panels.data, keptSeries, id)])) as Partial<
    Record<PanelId, PanelResult>
  >;

  const series = (id: PanelId) => {
    const r = results[id];
    return r?.kind === "value" ? r.series : [];
  };
  const alertsResult = results.alerts;
  const alerts = alertsOf(series("alerts"));

  return {
    status: panels.isPending ? "loading" : failed ? "unavailable" : "ready",
    error: failed ? messageOf(failed, "Prometheus unreachable") : null,
    results,
    services: servicesOf(
      series("services-up"),
      series("red-rate"),
      series("red-errors"),
      series("red-latency"),
    ),
    alerts,
    firingCount:
      alertsResult?.kind === "value" ? alerts.filter((a) => a.state === "firing").length : null,
    query,
    setQuery,
    selectedService,
    selectService,
    selectedPanel,
    selectPanel,
    alertOpen,
    setAlertOpen,
  };
}
