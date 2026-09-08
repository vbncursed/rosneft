import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { openJobStream } from "../api/job-stream";
import { isLive, type TargetJob } from "./target-job";

/**
 * The latest frame of one territory's conversion job over SSE, or null —
 * before the first frame, without an id, or after the channel is lost. A
 * frame for another target is dropped: a stale or pasted id must not repaint
 * this territory's page with someone else's job.
 */
export function useJobStream(jobId: string | null, slug: string): TargetJob | null {
  const client = useQueryClient();
  const [job, setJob] = useState<TargetJob | null>(null);

  useEffect(() => {
    if (jobId === null) return;
    return openJobStream(jobId, {
      onJob: (next) => {
        if (next.kind !== "territory" || next.slug !== slug) return;
        setJob(next);
        if (!isLive(next)) {
          void client.invalidateQueries({ queryKey: ["artifacts", "territory", slug] });
          void client.invalidateQueries({ queryKey: ["jobs"] });
        }
      },
      // A channel that went away leaves no frame to trust: the poll's row must win again.
      onEnd: (why) => {
        if (why === "lost") setJob(null);
      },
    });
  }, [jobId, slug, client]);

  return job;
}
