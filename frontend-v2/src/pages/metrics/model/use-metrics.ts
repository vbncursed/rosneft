import { useQueries } from "@tanstack/react-query";
import { useState } from "react";
import {
  alertsOf,
  PANELS,
  panelQuery,
  servicesOf,
  type AlertSummary,
  type MetricsRange,
  type PanelId,
  type ServiceHealth,
} from "@/entities/metric";
import { messageOf } from "@/shared/api";
import { unanswered } from "@/shared/lib/unanswered";
import type { PanelResult } from "./dashboard";

const ALL: PanelId[] = Object.keys(PANELS) as PanelId[];

export type MetricsState = {
  status: "loading" | "ready" | "unavailable";
  error: string | null;
  results: Partial<Record<PanelId, PanelResult>>;
  services: ServiceHealth[];
  alerts: AlertSummary[];
  firingCount: number;
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
 * Everything the Metrics screen decides. One query per panel, all keyed on
 * the range the route holds; a failed panel is one dark card, and only a
 * dashboard where every panel failed is unavailable.
 */
export function useMetrics(range: MetricsRange): MetricsState {
  const [query, setQuery] = useState("");
  const [selectedService, selectService] = useState<string | null>(null);
  const [selectedPanel, selectPanel] = useState<string | null>(null);
  const [alertOpen, setAlertOpen] = useState(true);

  const panels = useQueries({
    queries: ALL.map((id) => panelQuery(id, range)),
    // `combine` is inline for symmetry with use-content, where it must be:
    // ALL is a module constant here, so hoisting it would be fine too.
    combine: (rs) => ({
      pending: rs.some((r) => r.isPending),
      allFailed: rs.length > 0 && rs.every((r) => unanswered(r) !== null),
      firstError: rs.map(unanswered).find((e) => e !== null) ?? null,
      results: Object.fromEntries(
        rs.map((r, i): [PanelId, PanelResult] => [
          ALL[i],
          r.data
            ? { kind: "value", series: r.data }
            : r.error
              ? { kind: "unavailable", message: messageOf(r.error) }
              : { kind: "loading" },
        ]),
      ) as Partial<Record<PanelId, PanelResult>>,
    }),
  });

  const series = (id: PanelId) => {
    const r = panels.results[id];
    return r?.kind === "value" ? r.series : [];
  };
  const alerts = alertsOf(series("alerts"));

  return {
    status: panels.pending ? "loading" : panels.allFailed ? "unavailable" : "ready",
    error: panels.allFailed && panels.firstError ? messageOf(panels.firstError) : null,
    results: panels.results,
    services: servicesOf(
      series("services-up"),
      series("red-rate"),
      series("red-errors"),
      series("red-latency"),
    ),
    alerts,
    firingCount: alerts.filter((a) => a.state === "firing").length,
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
