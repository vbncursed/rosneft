import { useNavigate, useSearch } from "@tanstack/react-router";
import { SECTIONS, type MetricsRange } from "@/entities/metric";
import { Callout } from "@/shared/ui/callout";
import { Skeleton } from "@/shared/ui/skeleton";
import {
  alertDetails,
  matchesPanel,
  matchesSection,
  matchesService,
  panelEntry,
  statsOf,
} from "../model/dashboard";
import { useMetrics } from "../model/use-metrics";
import { MetricsPage } from "./metrics-page";

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

  const firing = s.alerts.find((a) => a.state === "firing") ?? s.alerts[0];
  const upCount = s.services.length > 0 ? s.services.length : null;

  return (
    <MetricsPage
      services={s.services.filter((svc) => matchesService(svc, s.query))}
      sections={SECTIONS.filter((sec) => matchesSection(sec, s.query)).map((sec) => ({
        key: sec.key,
        title: sec.title,
        panels: sec.panelIds
          .map((id) => panelEntry(id, s.results[id] ?? { kind: "loading" }))
          .filter((p) => matchesPanel(p.title, s.query)),
      }))}
      stats={statsOf(s.results, upCount)}
      range={range}
      onRangeChange={(next) => void navigate({ to: ".", search: { range: next } })}
      query={s.query}
      onQueryChange={s.setQuery}
      selectedService={s.selectedService}
      onSelectService={s.selectService}
      selectedPanel={s.selectedPanel}
      onSelectPanel={s.selectPanel}
      firingCount={s.firingCount}
      alert={
        s.alertOpen && firing
          ? { name: firing.name, meta: firing.meta, details: alertDetails(firing) }
          : null
      }
      onCloseAlert={() => s.setAlertOpen(false)}
    />
  );
}
