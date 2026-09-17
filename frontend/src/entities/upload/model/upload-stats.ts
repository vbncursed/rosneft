export type UploadSample = { at: number; bytes: number };

/**
 * Speed and ETA from the two most recent timestamped byte samples — a
 * rolling instantaneous rate rather than an average since the upload
 * started, which would understate a slow start and overstate a recovered
 * stall. Fewer than two samples, or two sharing a timestamp, answer null
 * rather than a division by zero or a meaningless single-point rate.
 */
export function uploadStats(
  samples: UploadSample[],
  total: number,
): { bytesPerSecond: number | null; etaSeconds: number | null } {
  if (samples.length < 2) return { bytesPerSecond: null, etaSeconds: null };
  const prev = samples[samples.length - 2];
  const last = samples[samples.length - 1];
  const seconds = (last.at - prev.at) / 1000;
  if (seconds <= 0) return { bytesPerSecond: null, etaSeconds: null };
  const bytesPerSecond = (last.bytes - prev.bytes) / seconds;
  const etaSeconds = bytesPerSecond > 0 ? (total - last.bytes) / bytesPerSecond : null;
  return { bytesPerSecond, etaSeconds };
}

/** Sub-minute reads as "<1 min" rather than a jittery second count; otherwise rounded to the nearest minute. */
export const formatEta = (s: number | null): string =>
  s === null ? "" : s < 60 ? "<1 min" : `~${Math.round(s / 60)} min`;
