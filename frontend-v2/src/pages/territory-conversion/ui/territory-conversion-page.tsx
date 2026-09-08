import { clsx as cx } from "clsx";
import { Pipeline, pipelineMeta, pipelineSteps, type TargetJob } from "@/entities/conversion";
import { ThemeToggle } from "@/features/theme-toggle";
import { Badge } from "@/shared/ui/badge";
import { Callout } from "@/shared/ui/callout";
import { ProgressBar } from "@/shared/ui/progress-bar";
import { PageHeader } from "@/widgets/page-header";
import { ledeOf, progressCard, STATUS_PILL, type TerritoryConversionPageProps } from "../model/conversion-view";
import { ConversionActions } from "./conversion-actions";

export type { TerritoryConversionPageProps };

export const WAITING_NOTE =
  "This page opens the viewer by itself once the artifacts land — no need to reload. Closing the tab does not stop the job.";

/** The mock's progress card: the stage and the percent over the bar, or the waiting row alone. */
function ProgressPanel({ phase, job }: { phase: "queued" | "running"; job: TargetJob | null }) {
  const card = progressCard(phase, job);
  return (
    <div
      className={cx(
        "rounded-card border bg-panel px-[22px] py-5",
        phase === "running" ? "border-accent-line" : "border-line",
      )}
    >
      <ProgressBar
        size="lg"
        label={card.title}
        detail={card.detail}
        ariaLabel="Conversion progress"
        {...(card.value === undefined ? {} : { value: card.value })}
      />
    </div>
  );
}

/** The conversion page: header, lede, the failure box or the progress card, the pipeline, the way forward. */
export function TerritoryConversionPage({ territory, phase, job, hasLod0, onOpenViewer }: TerritoryConversionPageProps) {
  const pill = STATUS_PILL[phase];
  const waiting = phase === "queued" || phase === "running";
  const stage = job?.stage ?? null;

  return (
    <div className="mx-auto flex w-full max-w-[760px] flex-col gap-5">
      <PageHeader
        size="lg"
        eyebrow={phase === "ready" ? "Converted" : "Converting"}
        title={territory.title}
        back={{ label: "← Territory catalog", href: "/territories" }}
        titleBadge={
          <Badge tone={pill.tone} fill={pill.fill} size="sm">
            {pill.label}
          </Badge>
        }
        meta={`territory · ${territory.slug}`}
        action={<ThemeToggle variant="compact" />}
      />
      <p className="m-0 max-w-[60ch] text-[13px] leading-[1.6] text-muted">
        {ledeOf(phase, { hasJob: job !== null, hasLod0 })}
      </p>
      {/* The gateway's *string serialises an absent message as "", not null. */}
      {phase === "failed" ? (
        <Callout tone="bad" size="lg" title="Worker message" mono>
          {job?.errorMessage || "The worker reported no message."}
        </Callout>
      ) : null}
      {/* Spelled out rather than reusing `waiting`: this is what narrows the prop. */}
      {phase === "queued" || phase === "running" ? <ProgressPanel phase={phase} job={job} /> : null}
      <section aria-label="Pipeline">
        <div className="flex items-center gap-3 pt-0.5 pb-3">
          <h2 className="m-0 text-[13px] font-semibold">Pipeline</h2>
          <span className="font-mono text-[10px] text-muted">{pipelineMeta(stage, phase)}</span>
          <span aria-hidden="true" className="h-px flex-1 bg-line" />
        </div>
        <Pipeline steps={pipelineSteps(stage, phase)} />
      </section>
      <ConversionActions phase={phase} slug={territory.slug} hasLod0={hasLod0} onOpenViewer={onOpenViewer} />
      {waiting ? (
        <Callout tone="warn" icon="info" size="note">
          {WAITING_NOTE}
        </Callout>
      ) : null}
    </div>
  );
}
