export type JobStatus = "pending" | "running" | "succeeded" | "failed";
export type JobKind = "territory" | "model";

export interface Job {
  id: string;
  kind: JobKind;
  slug: string;
  status: JobStatus;
  errorMessage?: string;
  artifactHash?: string;
  // Progress in [0, 1]; absent until the worker emits the first checkpoint.
  progress?: number;
  // Coarse stage label set by the worker — one of "fetching" /
  // "extracting" / "parsing" / "encoding" / "compressing" / "lod-N" /
  // "registering". Frontend maps to a human string.
  stage?: string;
  createdAt?: string;
  updatedAt?: string;
}

export function isTerminal(status: JobStatus): boolean {
  return status === "succeeded" || status === "failed";
}
