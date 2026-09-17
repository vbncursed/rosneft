export type TargetJobStatus = "pending" | "running" | "succeeded" | "failed";

// Not imported from @/entities/content: that slice already imports
// ConversionStatus from here, and a cycle between two entities is the kind
// of thing architecture.spec.ts cannot see but Vite's module graph can.
export type TargetKind = "territory" | "model";

/** The latest conversion job of one territory or model, as /api/jobs lists them. */
export type TargetJob = {
  kind: TargetKind;
  slug: string;
  status: TargetJobStatus;
  /** 0–1, or null before the worker has reported anything. */
  progress: number | null;
  stage: string | null;
  errorMessage: string | null;
};

export const isLive = (job: TargetJob): boolean =>
  job.status === "pending" || job.status === "running";

// Long enough not to hammer the gateway, short enough that a stage change
// (they come at coarse boundaries, seconds apart) reads as live.
const POLL_MS = 5000;

/** What jobsQuery hands refetchInterval: poll only while a conversion runs. */
export const pollInterval = (jobs: TargetJob[] | undefined): number | false =>
  jobs?.some(isLive) ? POLL_MS : false;

const key = (j: { kind: TargetKind; slug: string }) => `${j.kind}/${j.slug}`;

/** Targets that were live in `prev` and are not live in `next` — their artifacts may have changed. */
export function finishedSince(
  prev: TargetJob[] | undefined,
  next: TargetJob[],
): { kind: TargetKind; slug: string }[] {
  const stillLive = new Set(next.filter(isLive).map(key));
  return (prev ?? [])
    .filter((j) => isLive(j) && !stillLive.has(key(j)))
    .map(({ kind, slug }) => ({ kind, slug }));
}
