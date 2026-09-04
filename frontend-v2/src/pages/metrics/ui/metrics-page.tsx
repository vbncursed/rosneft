import { clsx as cx } from "clsx";
import {
  METRIC_RANGES,
  StatTile,
  type MetricsRange,
  type MetricState,
  type ServiceHealth,
  type StatTileTone,
} from "@/entities/metric";
import { FilterBar, type ExtraFilter } from "@/features/audit-filter";
import { Badge } from "@/shared/ui/badge";
import { CoverageMeter, type CoverageSegment } from "@/shared/ui/coverage-meter";
import { Segmented } from "@/shared/ui/segmented";
import { AlertInspector, type FiringAlert } from "@/widgets/alert-inspector";
import { MetricPanels, type MetricSection } from "@/widgets/metric-panels";
import { PageHeader } from "@/widgets/page-header";
import { ServiceHealthList } from "@/widgets/service-health";

export type MetricsPageStat = {
  label: string;
  /** Loading and unavailable are different states, and the tile says which. */
  state: MetricState;
  hint: string;
  tone?: StatTileTone;
  delta?: string;
  deltaTone?: StatTileTone;
};

export type MetricsPageProps = {
  services: ServiceHealth[];
  sections: MetricSection[];
  /** Absent while there is no budget to report — the meter is not drawn without one. */
  budget?: { label: string; detail: string; detailTone?: StatTileTone; segments: CoverageSegment[] };
  stats: MetricsPageStat[];

  range: MetricsRange;
  onRangeChange: (range: MetricsRange) => void;

  query: string;
  onQueryChange: (query: string) => void;
  extraFilters?: ExtraFilter[];

  selectedService: string | null;
  onSelectService: (name: string) => void;
  selectedPanel: string | null;
  onSelectPanel: (key: string) => void;

  /** How many alerts are firing; the header stays quiet at zero, and says so at null. */
  firingCount?: number | null;
  /** Replaces the health list's "no match" sentence when there is no filter to blame. */
  servicesHint?: string;
  /** Absent when nothing is firing, or while the detail is still loading. */
  alert?: FiringAlert | null;
  onCloseAlert: () => void;
  /** Each action reaches the inspector only when handed — no button with nothing behind it. */
  onSilence?: () => void;
  onOpenInAudit?: () => void;
  onCopyPromQl?: () => void;
};

// `state:` is a service state — up | degraded | down; the list has no "firing".
const FILTER_PLACEHOLDER = "filter: service:gateway group:red state:down";

export function MetricsPage({
  services,
  sections,
  budget,
  stats,
  range,
  onRangeChange,
  query,
  onQueryChange,
  extraFilters,
  selectedService,
  onSelectService,
  selectedPanel,
  onSelectPanel,
  firingCount = 0,
  servicesHint,
  alert,
  onCloseAlert,
  onSilence,
  onOpenInAudit,
  onCopyPromQl,
}: MetricsPageProps) {
  return (
    <>
      <PageHeader
        size="lg"
        eyebrow="Prometheus · scrape 15s"
        title="Metrics"
        action={
          <div className="flex items-center gap-2.5">
            {firingCount === null ? (
              <Badge tone="dim" fill="soft" className="tracking-[0.12em]">
                alerts unavailable
              </Badge>
            ) : firingCount > 0 ? (
              <Badge tone="bad" fill="soft" className="tracking-[0.12em]">
                <span aria-hidden="true" className="size-1.5 rounded-full bg-bad" />
                {firingCount} {firingCount === 1 ? "alert" : "alerts"}
              </Badge>
            ) : null}
            <Segmented
              ariaLabel="Time range"
              mono
              fill={false}
              tone="soft"
              value={range}
              onChange={onRangeChange}
              className="bg-panel"
              items={METRIC_RANGES.map((value) => ({ value, label: value }))}
            />
          </div>
        }
      />

      <div
        className={cx(
          "grid gap-3",
          budget
            ? "lg:grid-cols-[minmax(0,1.6fr)_repeat(4,minmax(0,1fr))]"
            : "sm:grid-cols-2 lg:grid-cols-5",
        )}
      >
        {budget ? (
          <CoverageMeter
            label={budget.label}
            detail={budget.detail}
            detailTone={budget.detailTone === "warn" ? "warn" : "ok"}
            segments={budget.segments}
            className="rounded-[11px] border border-line bg-panel px-4.5 py-4"
          />
        ) : null}
        {stats.map((stat) => (
          <StatTile
            key={stat.label}
            size="lg"
            label={stat.label}
            state={stat.state}
            hint={stat.hint}
            tone={stat.tone ?? "fg"}
            delta={stat.delta}
            deltaTone={stat.deltaTone}
          />
        ))}
      </div>

      <FilterBar
        query={query}
        onChange={onQueryChange}
        extra={extraFilters}
        label="Filter metrics"
        placeholder={FILTER_PLACEHOLDER}
      />

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(420px,1fr)_minmax(300px,380px)]">
        <div className="flex flex-col gap-4">
          <ServiceHealthList
            services={services}
            selectedName={selectedService}
            onSelect={onSelectService}
            emptyHint={servicesHint}
          />
          <MetricPanels
            sections={sections}
            selectedKey={selectedPanel}
            onSelect={onSelectPanel}
          />
        </div>

        {alert ? (
          // Sticky so the firing alert stays in view while the panels scroll.
          <div className="xl:sticky xl:top-6">
            <AlertInspector
              alert={alert}
              onClose={onCloseAlert}
              onSilence={onSilence}
              onOpenInAudit={onOpenInAudit}
              onCopyPromQl={onCopyPromQl}
            />
          </div>
        ) : null}
      </div>
    </>
  );
}
