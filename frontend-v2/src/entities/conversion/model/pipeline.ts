import type { StageState } from "./status";

export type PipelinePhase = "queued" | "running" | "failed" | "ready";

export type PipelineStep = { label: string; token: string; state: StageState };

/**
 * The worker's seven steps in the order it reports them
 * (mesh-service process_job.go + converter/*): the LOD pass comes after
 * encoding and compressing and is reported as lod-N twice — once per
 * simplified level, once per registered one — so every lod-N is one step.
 * `registering` arrives only with `succeeded`, so it is never active on
 * screen; it is listed because the mock lists it and the worker sends it.
 */
export const PIPELINE: readonly { token: string; label: string }[] = [
  { token: "fetching", label: "Fetching the archive" },
  { token: "extracting", label: "Extracting files" },
  { token: "parsing", label: "Parsing OBJ + MTL" },
  { token: "encoding", label: "Encoding geometry" },
  { token: "compressing", label: "Compressing textures" },
  { token: "lod-N", label: "Building LODs" },
  { token: "registering", label: "Registering artifacts" },
];

const LOD_STEP = 5;
const LOD = /^lod-\d+$/;

/** The step a worker token belongs to; -1 for nothing reported or a token this list does not know. */
export function stepIndexOf(stage: string | null): number {
  if (stage === null) return -1;
  if (LOD.test(stage)) return LOD_STEP;
  return PIPELINE.findIndex((s) => s.token === stage);
}

const stateAt = (i: number, at: number, phase: PipelinePhase): StageState => {
  if (phase === "ready") return "done";
  if (at < 0 || i > at) return "pending";
  if (i < at) return "done";
  return phase === "failed" ? "failed" : "active";
};

export function pipelineSteps(stage: string | null, phase: PipelinePhase): PipelineStep[] {
  // A queued job has done nothing, whatever stale token a requeue may carry.
  const at = phase === "queued" ? -1 : stepIndexOf(stage);
  return PIPELINE.map((s, i) => ({ ...s, state: stateAt(i, at, phase) }));
}

export function pipelineMeta(stage: string | null, phase: PipelinePhase): string {
  const n = PIPELINE.length;
  if (phase === "ready") return `${n} steps · finished`;
  if (phase === "queued") return `${n} steps · none started`;
  const at = stepIndexOf(stage);
  if (phase === "failed") return at < 0 ? "stopped before the first report" : `stopped at step ${at + 1} of ${n}`;
  return at < 0 ? `${n} steps · stage not reported` : `step ${at + 1} of ${n}`;
}
