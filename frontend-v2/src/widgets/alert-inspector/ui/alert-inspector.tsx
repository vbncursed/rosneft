import { clsx as cx } from "clsx";
import { Button } from "@/shared/ui/button";
import { DetailList, type Detail } from "@/shared/ui/detail-list";
import { LineChart, type Series } from "@/shared/ui/line-chart";
import { ProgressBar } from "@/shared/ui/progress-bar";

export type AlertContributor = {
  /** What is producing the errors, e.g. "GET /api/territories/:slug". */
  path: string;
  /** Printed value, e.g. "412". */
  value: string;
  /** 0–100, relative to the worst contributor. */
  share: number;
  tone?: "bad" | "warn" | "accent";
};

export type FiringAlert = {
  name: string;
  /** e.g. "gateway · severity: critical". */
  meta: string;
  /** How long it has been firing, e.g. "14m". */
  firingFor: string;
  /** expr / for / value / since. */
  details: Detail[];
  series: Series;
  /** Where the threshold sits, as a share of the chart's own maximum. */
  threshold?: { share: number; label: string };
  contributors: AlertContributor[];
};

export type AlertInspectorProps = {
  alert: FiringAlert;
  chartLabel?: string;
  onClose: () => void;
  onSilence: () => void;
  onOpenInAudit: () => void;
  onCopyPromQl: () => void;
};

const BAR: Record<NonNullable<AlertContributor["tone"]>, "bad" | "warn" | "accent"> = {
  bad: "bad",
  warn: "warn",
  accent: "accent",
};

const TEXT = { bad: "text-bad", warn: "text-warn", accent: "text-accent" } as const;

export function AlertInspector({
  alert,
  chartLabel = "5xx rate vs threshold",
  onClose,
  onSilence,
  onOpenInAudit,
  onCopyPromQl,
}: AlertInspectorProps) {
  return (
    <aside
      aria-label={`Alert: ${alert.name}`}
      className="overflow-hidden rounded-[14px] border border-bad bg-panel shadow-elevation"
    >
      <div className="flex items-start justify-between gap-3 border-b border-line bg-bad-soft p-4.5">
        <div className="min-w-0">
          <p className="m-0 font-mono text-[9px] uppercase tracking-[0.2em] text-bad">
            Firing · {alert.firingFor}
          </p>
          <p className="m-0 mt-2 truncate text-base font-semibold text-fg">{alert.name}</p>
          <p className="m-0 mt-[3px] truncate font-mono text-[11px] text-muted">{alert.meta}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="cursor-pointer border-none bg-transparent p-0 leading-none text-muted transition-colors duration-150 hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          ×
        </button>
      </div>

      <div className="flex flex-col gap-4.5 p-4.5">
        <div>
          <p className="m-0 mb-2.5 font-mono text-[9px] uppercase tracking-[0.2em] text-muted">
            {chartLabel}
          </p>
          <div className="relative">
            <LineChart series={[alert.series]} label={chartLabel} height={96} />
            {alert.threshold ? (
              <>
                {/* The threshold is the whole point of this chart, so it is drawn
                    on the plot rather than left to the legend. */}
                <span
                  aria-hidden="true"
                  className="absolute inset-x-0 h-px bg-warn opacity-60"
                  style={{ top: `${100 - alert.threshold.share}%` }}
                />
                <span
                  className="absolute right-2 font-mono text-[9px] uppercase tracking-[0.12em] text-warn"
                  style={{ top: `calc(${100 - alert.threshold.share}% - 16px)` }}
                >
                  {alert.threshold.label}
                </span>
              </>
            ) : null}
          </div>
        </div>

        <DetailList items={alert.details} />

        {alert.contributors.length > 0 ? (
          <div>
            <p className="m-0 mb-2.5 font-mono text-[9px] uppercase tracking-[0.2em] text-muted">
              Top contributors
            </p>
            <div className="flex flex-col gap-2.5">
              {alert.contributors.map((contributor) => (
                <div key={contributor.path}>
                  <div className="flex items-baseline justify-between gap-2.5">
                    <span className="truncate font-mono text-[11px] text-fg">
                      {contributor.path}
                    </span>
                    <span
                      className={cx("font-mono text-[11px]", TEXT[contributor.tone ?? "bad"])}
                    >
                      {contributor.value}
                    </span>
                  </div>
                  <ProgressBar
                    className="mt-1.5 [&>div]:h-1"
                    variant="thin"
                    value={contributor.share}
                    tone={BAR[contributor.tone ?? "bad"]}
                    ariaLabel={`${contributor.path} share`}
                  />
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="flex flex-col gap-2 border-t border-line pt-3.5">
          <div className="flex gap-2">
            <Button size="sm" className="flex-1 justify-center" onClick={onSilence}>
              Silence 1h
            </Button>
            <Button
              size="sm"
              variant="accent"
              className="flex-1 justify-center"
              onClick={onOpenInAudit}
            >
              Open in audit
            </Button>
          </div>
          <Button size="sm" variant="ghost" className="justify-center border-line" onClick={onCopyPromQl}>
            Copy PromQL
          </Button>
        </div>
      </div>
    </aside>
  );
}
