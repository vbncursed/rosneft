import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Job, JobStatus } from "@/shared/domain/job";
import { useJobStream } from "@/conversion/application/use-job-stream";

export interface UseConversionWatcher {
  status: JobStatus | "polling" | "unavailable";
  // Progress in [0, 1]; 0 until the worker emits the first checkpoint.
  progress: number;
  // Coarse stage label from the worker (or null until first frame).
  stage: string | null;
  error: string | null;
}

const POLL_INTERVAL_MS = 4000;

// useConversionWatcher drives the pending-conversion screen.
//   - With a jobId (we just created the territory), subscribe to SSE for
//     live progress + status; trigger router.refresh() on succeeded.
//   - Without a jobId (revisiting an entity whose conversion was queued
//     by the background reconciler), fall back to polling — when the
//     artifact lands the page re-renders into the viewer.
export function useConversionWatcher(jobId: string | null): UseConversionWatcher {
  const router = useRouter();
  const [status, setStatus] = useState<UseConversionWatcher["status"]>(
    jobId ? "pending" : "polling",
  );
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onUpdate = useCallback(
    (job: Job) => {
      setStatus(job.status);
      if (typeof job.progress === "number") setProgress(job.progress);
      if (job.stage) setStage(job.stage);
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

  return { status, progress, stage, error };
}
