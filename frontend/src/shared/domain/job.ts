export type JobStatus = "pending" | "running" | "succeeded" | "failed";
export type JobKind = "territory" | "model";

export interface Job {
  id: string;
  kind: JobKind;
  slug: string;
  status: JobStatus;
  errorMessage?: string;
  artifactHash?: string;
  createdAt?: string;
  updatedAt?: string;
}

export function isTerminal(status: JobStatus): boolean {
  return status === "succeeded" || status === "failed";
}
