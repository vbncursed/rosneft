import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
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

// Drives the pending-conversion screen.
//   - With a jobId: SSE for live progress; on succeeded, invalidate the scene
//     query so the route re-renders into the viewer.
//   - Without a jobId: poll by invalidating the scene query every 4s until the
//     artifact lands (background reconciler queued the conversion).
// The invalidation target ["scene", slug] mirrors sceneBundleQuery's key.
export function useConversionWatcher(
  jobId: string | null,
  slug: string,
): UseConversionWatcher {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<UseConversionWatcher["status"]>(
    jobId ? "pending" : "polling",
  );
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ["scene", slug] }),
    [queryClient, slug],
  );

  const onUpdate = useCallback(
    (job: Job) => {
      setStatus(job.status);
      if (typeof job.progress === "number") setProgress(job.progress);
      if (job.stage) setStage(job.stage);
      if (job.errorMessage) setError(job.errorMessage);
      if (job.status === "succeeded") void refresh();
    },
    [refresh],
  );
  useJobStream(jobId, onUpdate);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (jobId) return;
    intervalRef.current = setInterval(() => void refresh(), POLL_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [jobId, refresh]);

  return { status, progress, stage, error };
}
