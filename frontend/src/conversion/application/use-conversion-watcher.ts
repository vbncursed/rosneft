import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Job, JobKind, JobStatus } from "@/shared/domain/job";
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

// The queries each entity's screen is built from. Both routes render the same
// pending screen, so the watcher has to invalidate whichever keys back the
// caller — invalidating ["scene"] on a model matches nothing, leaving the user
// on "Done, refreshing the page…" until a manual reload.
const REFRESH_KEYS: Record<JobKind, string[]> = {
  territory: ["scene"],
  model: ["model", "model-artifacts"],
};

// Drives the pending-conversion screen.
//   - With a jobId: SSE for live progress; on succeeded, invalidate the
//     entity's queries so the route re-renders into the viewer.
//   - Without a jobId: poll the same invalidation every 4s until the artifact
//     lands (background reconciler queued the conversion).
export function useConversionWatcher(
  jobId: string | null,
  slug: string,
  kind: JobKind,
): UseConversionWatcher {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<UseConversionWatcher["status"]>(
    jobId ? "pending" : "polling",
  );
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(
    () =>
      Promise.all(
        REFRESH_KEYS[kind].map((key) =>
          queryClient.invalidateQueries({ queryKey: [key, slug] }),
        ),
      ),
    [queryClient, slug, kind],
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
