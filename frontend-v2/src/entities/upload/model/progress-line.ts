import type { UploadProgress } from "./run-chunked-upload";
import { formatEta, uploadStats, type UploadSample } from "./upload-stats";
import { formatBytes } from "@/shared/lib/format-bytes";

export type UploadProgressView = { value: number; header: string; stats: string[] };

/**
 * The upload progress panel's two text lines. `stats` is `uploadStats`'s
 * output — speed and ETA read null until two byte samples exist.
 */
export function progressLine(
  p: UploadProgress,
  stats: { bytesPerSecond: number | null; etaSeconds: number | null },
): { header: string; stats: string[] } {
  const pct = Math.round((p.bytes / p.total) * 100);
  const eta = formatEta(stats.etaSeconds);
  const speed = stats.bytesPerSecond !== null ? `${formatBytes(stats.bytesPerSecond)}/s` : "—";
  return {
    header: `${pct}% · ${formatBytes(p.bytes)} / ${formatBytes(p.total)}${eta ? ` · ${eta}` : ""}`,
    stats: [`chunk ${p.chunk} / ${p.chunks}`, "8 MB chunks", speed, "resumable"],
  };
}

/**
 * Whether the progress panel shows, and what it says: only while the caller
 * says it is busy — the page decides which of its own phases count, this
 * entity no longer knows the phase union.
 */
export function progressFor(
  busy: boolean,
  progress: UploadProgress | null,
  samples: UploadSample[],
): UploadProgressView | undefined {
  if (!progress || !busy) return undefined;
  const value = Math.round((progress.bytes / progress.total) * 100);
  return { value, ...progressLine(progress, uploadStats(samples, progress.total)) };
}
