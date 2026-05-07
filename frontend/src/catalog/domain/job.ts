export type JobStatus = "pending" | "running" | "succeeded" | "failed";

export interface Job {
  id: string;
  projectSlug: string;
  status: JobStatus;
  errorMessage?: string;
  artifactHash?: string;
  createdAt?: string;
  updatedAt?: string;
}

export function isTerminal(status: JobStatus): boolean {
  return status === "succeeded" || status === "failed";
}
