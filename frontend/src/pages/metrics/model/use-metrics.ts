import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  alertsOf,
  PANELS,
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

const ALL: PanelId[] = Object.keys(PANELS) as PanelId[];
const NO_ANSWER = "Prometheus did not answer";

/** A panel the gateway left out of an answered map failed on its own: one dark card. */
const resultOf = (data: PanelSeries | undefined, id: PanelId): PanelResult => {
  if (!data) return { kind: "loading" };
  const series = data[id];
  return series ? { kind: "value", series } : { kind: "unavailable", message: NO_ANSWER };
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
 * the range the route holds; a panel the gateway could not answer is one dark
 * card, and only a request that never answered makes the dashboard unavailable.
 */
export function useMetrics(range: MetricsRange): MetricsState {
  const [query, setQuery] = useState("");
  const [selectedService, selectService] = useState<string | null>(null);
  const [selectedPanel, selectPanel] = useState<string | null>(null);
  const [alertOpen, setAlertOpen] = useState(true);

  const panels = useQuery(panelsQuery(range));
  const failed = unanswered(panels);
  const results = Object.fromEntries(ALL.map((id) => [id, resultOf(panels.data, id)])) as Partial<
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
    error: failed ? messageOf(failed) : null,
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
