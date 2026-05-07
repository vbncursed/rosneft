import { useEffect } from "react";
import type { Job, JobKind } from "@/shared/domain/job";
import { isTerminal } from "@/shared/domain/job";

interface JobEventPayload {
  id: string;
  kind: JobKind;
  slug: string;
  status: Job["status"];
  errorMessage?: string;
  artifactHash?: string;
  createdAt?: string;
  updatedAt?: string;
}

// useJobStream subscribes to the gateway's SSE channel for one conversion
// job and dispatches `onUpdate` on every status change. The browser closes
// EventSource automatically when the server hangs up after a terminal
// status; we also call .close() on unmount to be safe.
//
// jobId === null means "no subscription yet".
export function useJobStream(
  jobId: string | null,
  onUpdate: (job: Job) => void,
): void {
  useEffect(() => {
    if (!jobId) return;
    const url = `/api/jobs/${encodeURIComponent(jobId)}/events`;
    const source = new EventSource(url);

    const handle = (event: MessageEvent<string>) => {
      try {
        const payload = JSON.parse(event.data) as JobEventPayload;
        const job: Job = {
          id: payload.id,
          kind: payload.kind,
          slug: payload.slug,
          status: payload.status,
          errorMessage: payload.errorMessage,
          artifactHash: payload.artifactHash,
          createdAt: payload.createdAt,
          updatedAt: payload.updatedAt,
        };
        onUpdate(job);
        if (isTerminal(job.status)) {
          source.close();
        }
      } catch {
        // malformed frame — ignore
      }
    };

    source.addEventListener("job", handle as EventListener);
    return () => {
      source.removeEventListener("job", handle as EventListener);
      source.close();
    };
  }, [jobId, onUpdate]);
}
