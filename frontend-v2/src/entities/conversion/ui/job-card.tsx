import { clsx as cx } from "clsx";
import { Badge } from "@/shared/ui/badge";
import { ProgressBar } from "@/shared/ui/progress-bar";
import type { JobCardModel, JobCardStatus } from "../model/job-card";

export type JobCardProps = { card: JobCardModel };

const SKIN: Record<JobCardStatus, { card: string; rail: string; link: string }> = {
  converting: { card: "border-warn bg-warn-soft", rail: "bg-warn", link: "text-accent" },
  queued: { card: "border-line bg-panel", rail: "bg-line-2", link: "text-accent" },
  failed: { card: "border-bad bg-bad-soft", rail: "bg-bad", link: "text-bad" },
};

const BADGE: Record<JobCardStatus, { tone: "warn" | "neutral" | "bad"; fill: "soft" | "outline" }> =
  {
    converting: { tone: "warn", fill: "soft" },
    queued: { tone: "neutral", fill: "outline" },
    failed: { tone: "bad", fill: "soft" },
  };

/** One conversion in the In-progress strip: a railed card with the status word, the meta line, and the bar or the failure. */
export function JobCard({ card }: JobCardProps) {
  const skin = SKIN[card.status];
  return (
    <article
      aria-label={card.title}
      className={cx(
        "relative overflow-hidden rounded-[12px] border py-[15px] pl-5 pr-[17px]",
        skin.card,
      )}
    >
      <span aria-hidden="true" className={cx("absolute inset-y-0 left-0 w-[3px]", skin.rail)} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-[9px]">
            <p className="m-0 text-sm font-semibold">{card.title}</p>
            <Badge tone={BADGE[card.status].tone} fill={BADGE[card.status].fill} shape="pill" size="sm">
              {card.status}
            </Badge>
          </div>
          <p className="m-0 mt-[5px] font-mono text-[10px] text-muted">{card.meta}</p>
        </div>
        <a
          href={card.href}
          aria-label={`Open ${card.kind} ${card.slug}`}
          className={cx(
            "whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.12em] no-underline hover:underline",
            skin.link,
          )}
        >
          Open {card.title} →
        </a>
      </div>
      {card.percent !== undefined ? (
        <div className="mt-3 flex items-center gap-[11px]">
          <ProgressBar
            size="lg"
            tone="warn"
            value={card.percent}
            ariaLabel={`Conversion of ${card.title}`}
            className="flex-1"
          />
          <span className="whitespace-nowrap font-mono text-[11px] text-warn">{card.percent}%</span>
        </div>
      ) : null}
      {card.error ? (
        <p className="m-0 mt-[11px] break-words font-mono text-[11px] leading-[1.5] text-bad select-text">
          {card.error}
        </p>
      ) : null}
    </article>
  );
}
