import type { components } from "@/shared/api/dto";
import { isLive, type TargetJob } from "../model/target-job";
import { toTargetJob } from "./to-target-job";

type JobDto = components["schemas"]["Job"];

/** Why a stream stopped: the job reached a terminal state, or the channel went away. */
export type StreamEnd = "finished" | "lost";

export type JobStreamHandlers = {
  onJob: (job: TargetJob) => void;
  onEnd: (why: StreamEnd) => void;
};

const API_BASE = import.meta.env.VITE_API_URL;

/**
 * Subscribes to one job's SSE channel and returns the closer.
 *
 * /api/jobs/{id}/events requires a session. EventSource can carry no header
 * at all, so this works only because the URL is same-origin — VITE_API_URL
 * is empty in dev and prod alike — and the browser attaches the httpOnly
 * session cookie on its own.
 *
 * A platform without EventSource (jsdom, an old webview) gets a no-op closer
 * and never a frame; the caller's poll is the whole story there.
 */
export function openJobStream(id: string, handlers: JobStreamHandlers): () => void {
  const Source = globalThis.EventSource;
  if (typeof Source === "undefined") return () => {};
  const source = new Source(`${API_BASE}/api/jobs/${encodeURIComponent(id)}/events`);
  let open = true;
  const end = (why: StreamEnd) => {
    if (!open) return;
    open = false;
    source.close();
    handlers.onEnd(why);
  };
  source.addEventListener("job", (event) => {
    let job: TargetJob;
    try {
      job = toTargetJob(JSON.parse((event as MessageEvent<string>).data) as JobDto);
    } catch {
      return; // a malformed frame is not a reason to drop the channel
    }
    handlers.onJob(job);
    if (!isLive(job)) end("finished");
  });
  // Two things arrive as "error": the gateway's own `event: error` frame (an
  // unknown or foreign id — it carries data) and the browser's connection
  // error (no data). Neither will ever deliver a job; the poll takes over.
  source.addEventListener("error", () => end("lost"));
  return () => {
    open = false;
    source.close();
  };
}
