/**
 * Where a source upload has got to on its way to a viewable GLB. The job
 * decides first: a live one from `GET /api/jobs` says `converting`, a failed
 * one `failed`. With no job to go on the artifacts decide — some means
 * `ready`, none means `pending`, which is now only ever "nothing has been
 * converted yet" rather than the old catch-all that also covered failures.
 */
export type ConversionStatus = "ready" | "pending" | "converting" | "failed";

/** A conversion the worker is running, or has stopped running. */
export type JobState = "queued" | "running" | "failed";

export type ConversionJob = {
  id: string;
  /** The territory or model being converted. */
  slug: string;
  state: JobState;
  /** 0–100; absent before the worker reports anything. */
  progress?: number;
  /** What it is doing, or why it stopped. */
  stage: string;
  /** e.g. "~4 min", or "—" when there is nothing to estimate. */
  eta: string;
};

export const JOB_TONE = { queued: "neutral", running: "warn", failed: "bad" } as const;

/** A failed job's bar is full: it got as far as it is going to get. */
export const jobProgress = (job: ConversionJob) =>
  job.state === "failed" ? 100 : job.progress;

/** One step of the pipeline, as the inspector and the conversion page list them. */
export type StageState = "done" | "active" | "failed" | "pending";

export type ConversionStage = {
  label: string;
  state: StageState;
  /** Elapsed for a finished step, or what it is doing, e.g. "running". */
  time: string;
  /** A second, quieter line under the label — the upload pipeline's mock draws one per stage. */
  hint?: string;
};

export const STAGE_DOT: Record<StageState, string> = {
  done: "bg-ok",
  active: "bg-warn",
  failed: "bg-bad",
  pending: "bg-line-2",
};

export const STAGE_TEXT: Record<StageState, string> = {
  done: "text-fg",
  active: "text-warn",
  failed: "text-bad",
  pending: "text-dim",
};

export type ActiveTone = "warn" | "accent";

/**
 * A stage's dot/text classes. Done and pending never change; the active step
 * can switch from the conversion pipeline's warn to the upload pipeline's
 * accent, which is the only thing `activeTone` decides.
 */
export function toneClasses(state: StageState, activeTone: ActiveTone = "warn") {
  if (state !== "active") return { dot: STAGE_DOT[state], text: STAGE_TEXT[state] };
  return activeTone === "accent"
    ? { dot: "bg-accent", text: "text-accent" }
    : { dot: STAGE_DOT.active, text: STAGE_TEXT.active };
}
