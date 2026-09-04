import { useNavigate, useSearch } from "@tanstack/react-router";
import { SECTIONS, type MetricsRange, type ServiceHealth } from "@/entities/metric";
import { Callout } from "@/shared/ui/callout";
import { Skeleton } from "@/shared/ui/skeleton";
import {
  alertDetails,
  matchesPanel,
  matchesSection,
  matchesService,
  panelEntry,
  servicesHint,
  statsOf,
} from "../model/dashboard";
import { useMetrics } from "../model/use-metrics";
import { MetricsPage } from "./metrics-page";

const SERVICE_SEGMENTS: {
  state: ServiceHealth["state"];
  tone: "ok" | "warn" | "bad";
  label: string;
}[] = [
  { state: "up", tone: "ok", label: "up" },
  { state: "degraded", tone: "warn", label: "degraded" },
  { state: "down", tone: "bad", label: "down" },
];

/** Maps the container onto the page; the range lives in the URL. */
export function MetricsScreen() {
  // `strict: false` types the search loosely — the route's own validateSearch
  // is what guarantees the shape, and `pages` may not import `app` to borrow
  // its typed hook.
  const { range } = useSearch({ strict: false }) as { range: MetricsRange };
  const navigate = useNavigate();
  const s = useMetrics(range);

  if (s.status === "loading") {
    return (
      <div
        role="status"
        aria-busy="true"
        aria-label="Loading dashboard"
        className="flex flex-col gap-3"
      >
        <Skeleton height="28px" width="30%" />
        <Skeleton height="96px" />
        <Skeleton height="96px" />
      </div>
    );
  }
  if (s.status === "unavailable") {
    return <Callout tone="bad">Metrics are unavailable: {s.error}</Callout>;
  }

  // Only a firing alert opens the inspector: its header is an unconditional
  // red "Firing", so a pending one underneath it would be a lie.
  const firing = s.alerts.find((a) => a.state === "firing") ?? null;
  const up = s.results["services-up"];
  const healthy = s.services.filter((svc) => svc.state === "up").length;
  // No meter without an answer from services-up: "0 of 0 up" in green is a
  // confident lie about an outage, and `servicesHint` already says so instead.
  const budget =
    up?.kind === "value"
      ? {
          label: "Service health",
          // The meter counts services by name, not scrape targets: a replicated
          // service is several targets and one row in the health list.
          detail: `${healthy} of ${s.services.length} up`,
          ...(healthy === s.services.length ? {} : { detailTone: "warn" as const }),
          segments: SERVICE_SEGMENTS.map(({ state, tone, label }) => ({
            tone,
            label,
            value: s.services.filter((svc) => svc.state === state).length,
          })),
        }
      : undefined;

  return (
    <MetricsPage
      services={s.services.filter((svc) => matchesService(svc, s.query))}
      sections={SECTIONS.filter((sec) => matchesSection(sec, s.query)).map((sec) => ({
        key: sec.key,
        title: sec.title,
        panels: sec.panelIds
          .map((id) => panelEntry(id, s.results[id] ?? { kind: "loading" }, s.selectedService))
          .filter((p) => matchesPanel(p.title, s.query)),
      }))}
      {...(budget ? { budget } : {})}
      stats={statsOf(s.results)}
      range={range}
      onRangeChange={(next) => void navigate({ to: ".", search: { range: next } })}
      query={s.query}
      onQueryChange={s.setQuery}
      selectedService={s.selectedService}
      onSelectService={s.selectService}
      selectedPanel={s.selectedPanel}
      onSelectPanel={s.selectPanel}
      firingCount={s.firingCount}
      servicesHint={servicesHint(up)}
      alert={
        s.alertOpen && firing
          ? { name: firing.name, meta: firing.meta, details: alertDetails(firing) }
          : null
      }
      onCloseAlert={() => s.setAlertOpen(false)}
    />
  );
}
