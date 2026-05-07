import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Job, JobStatus } from "@/shared/domain/job";
import { useJobStream } from "@/conversion/application/use-job-stream";

export interface UseConversionWatcher {
  status: JobStatus | "polling" | "unavailable";
  error: string | null;
}

const POLL_INTERVAL_MS = 4000;

// useConversionWatcher drives the pending-conversion screen.
// 1. If the caller passes a jobId (we just created the territory and
//    received it from POST /api/territories), subscribe to SSE for live
//    updates and trigger a router.refresh() on succeeded.
// 2. Otherwise (e.g. navigating to a territory whose conversion was
//    queued elsewhere by the worker reconciler), fall back to polling
//    the page every POLL_INTERVAL_MS — when the artifact lands the page
//    re-renders into the viewer.
export function useConversionWatcher(jobId: string | null): UseConversionWatcher {
  const router = useRouter();
  const [status, setStatus] = useState<UseConversionWatcher["status"]>(
    jobId ? "pending" : "polling",
  );
  const [error, setError] = useState<string | null>(null);

  const onUpdate = useCallback(
    (job: Job) => {
      setStatus(job.status);
      if (job.errorMessage) setError(job.errorMessage);
      if (job.status === "succeeded") router.refresh();
    },
    [router],
  );
  useJobStream(jobId, onUpdate);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (jobId) return;
    intervalRef.current = setInterval(() => router.refresh(), POLL_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [jobId, router]);

  return { status, error };
}
