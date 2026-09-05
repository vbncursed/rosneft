/**
 * Where a source upload has got to on its way to a viewable GLB. The job
 * decides first: a live one from `GET /api/jobs` says `converting`, a failed
 * one `failed`. With no job to go on the artifacts decide — some means
 * `ready`, none means `pending`, which is now only ever "nothing has been
 * converted yet" rather than the old catch-all that also covered failures.
 */
export type ConversionStatus = "ready" | "pending" | "converting" | "failed";

export type ConversionState = {
  status: ConversionStatus;
  /** 0–100 while converting; ignored otherwise. */
  progress?: number;
};

/** Only a finished conversion can be opened in the viewer. */
export const isOpenable = (state: ConversionState) => state.status === "ready";

/**
 * The footer note a catalog card shows on the right: a way in when the scene
 * is ready, how far along when it is not, and nothing when it failed — the
 * badge already says that, and repeating it twice reads as two problems.
 */
export function trailingNote(state: ConversionState): string | undefined {
  if (state.status === "ready") return "Open →";
  if (state.status === "converting") {
    return state.progress === undefined ? "Converting…" : `${Math.round(state.progress)}%`;
  }
  return undefined;
}

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

/** One step of the pipeline, as the inspector lists them. */
export type StageState = "done" | "active" | "pending";

export type ConversionStage = {
  label: string;
  state: StageState;
  /** Elapsed for a finished step, or what it is doing, e.g. "running". */
  time: string;
};

export const STAGE_DOT: Record<StageState, string> = {
  done: "bg-ok",
  active: "bg-warn",
  pending: "bg-line-2",
};

export const STAGE_TEXT: Record<StageState, string> = {
  done: "text-fg",
  active: "text-warn",
  pending: "text-dim",
};
