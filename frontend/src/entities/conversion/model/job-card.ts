import { stageLabel } from "./stage-label";
import type { TargetJob, TargetKind } from "./target-job";

export type JobCardStatus = "converting" | "queued" | "failed";

/** One conversion in Home's In-progress strip. */
export type JobCardModel = {
  kind: TargetKind;
  slug: string;
  title: string;
  href: string;
  status: JobCardStatus;
  /** "territory · refinery-block-c · building LOD 1" */
  meta: string;
  /** 0–100, converting only. */
  percent?: number;
  /** failed only; never empty. */
  error?: string;
};

export type TitleOf = (kind: TargetKind, slug: string) => string | undefined;

const STATUS: Record<TargetJob["status"], JobCardStatus> = {
  running: "converting",
  pending: "queued",
  failed: "failed",
  // Never listed by /api/jobs; a card for one reads as done-and-gone.
  succeeded: "queued",
};

const RANK: Record<TargetJob["status"], number> = {
  running: 0,
  pending: 1,
  failed: 2,
  succeeded: 3,
};

// "Building LOD 1" → "building LOD 1": only the first letter drops, so a
// token's own capitals (LOD, OBJ) survive.
const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** The third segment of the meta line: what the worker is doing, or where it stopped. */
export function jobPhrase(job: TargetJob): string {
  if (job.status === "failed") {
    return job.stage
      ? `stopped while ${lowerFirst(stageLabel(job.stage))}`
      : "stopped before the first report";
  }
  if (job.status === "pending") return "waiting for a worker";
  return job.stage ? lowerFirst(stageLabel(job.stage)) : "waiting for a report";
}

// ponytail: territoryPath/modelPath live in entities/territory and entities/model,
// which already import this slice — importing them back would be a cycle.
const hrefOf = (kind: TargetKind, slug: string) =>
  `/${kind === "territory" ? "territories" : "models"}/${encodeURIComponent(slug)}`;

export function toJobCard(job: TargetJob, titleOf: TitleOf): JobCardModel {
  const status = STATUS[job.status];
  return {
    kind: job.kind,
    slug: job.slug,
    title: titleOf(job.kind, job.slug) ?? job.slug,
    href: hrefOf(job.kind, job.slug),
    status,
    meta: [job.kind, job.slug, jobPhrase(job)].join(" · "),
    ...(status === "converting" ? { percent: Math.round((job.progress ?? 0) * 100) } : {}),
    // The gateway's *string serialises an absent message as "", not null.
    ...(status === "failed" ? { error: job.errorMessage || "The worker reported no message." } : {}),
  };
}

/** Running first, then queued, then failed; slug within — the strip's order. */
export const sortJobs = (jobs: TargetJob[]): TargetJob[] =>
  [...jobs].sort((a, b) => RANK[a.status] - RANK[b.status] || a.slug.localeCompare(b.slug));
