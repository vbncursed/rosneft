import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { submitConversion } from "@/catalog/infrastructure/catalog-gateway";
import type { Job, JobStatus } from "@/catalog/domain/job";
import { useJobStream } from "@/conversion/application/use-job-stream";
import { formatError } from "@/shared/infrastructure/http/format-error";

export interface UseConversionWatcher {
  status: JobStatus | "submitting" | "unavailable";
  error: string | null;
}

// useConversionWatcher orchestrates the pending-conversion screen:
// 1. POST /convert when the screen mounts → get a jobId.
// 2. Subscribe to the SSE stream for that jobId.
// 3. router.refresh() once the job reports succeeded — the page rebuilds
//    against the now-present LOD0 artifact and swaps in the viewer.
//
// Submission is idempotent operationally (worker re-converts the same OBJ
// to the same blob hash + catalog upserts), so a refresh that races the
// reconciler-enqueued job is safe.
export function useConversionWatcher(slug: string): UseConversionWatcher {
  const router = useRouter();
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<UseConversionWatcher["status"]>(
    "submitting",
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    submitConversion(slug)
      .then((job) => {
        if (cancelled) return;
        setJobId(job.id);
        setStatus(job.status);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setStatus("unavailable");
        setError(formatError(err));
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const onUpdate = useCallback(
    (job: Job) => {
      setStatus(job.status);
      if (job.errorMessage) setError(job.errorMessage);
      if (job.status === "succeeded") router.refresh();
    },
    [router],
  );

  useJobStream(jobId, onUpdate);

  return { status, error };
}
