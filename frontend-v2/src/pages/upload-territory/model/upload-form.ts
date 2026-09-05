import type { ConversionStage, StageState } from "@/entities/conversion";
import { formatEta, uploadStats, type UploadProgress, type UploadSample } from "@/entities/upload";
import { formatBytes } from "@/shared/lib/format-bytes";
import type { ChecklistItem } from "@/shared/ui/checklist";

export type UploadPhase = "idle" | "picked" | "uploading" | "finalizing" | "creating" | "failed";

export type UploadForm = { title: string; description: string; panoramaUrl: string };

/**
 * The Upload button is live only once a file is picked and the title is not
 * blank. A type predicate on `file` — not just a boolean — so callers that
 * guard on it (the hook's `onSubmit`) keep `file` narrowed to `File` for the
 * upload call that follows, instead of re-checking it a second time.
 */
export const canSubmit = (phase: UploadPhase, file: File | null, form: UploadForm): file is File =>
  phase === "picked" && !!file && form.title.trim() !== "";

/** The file card's meta line: no hash yet (that only exists after finalize), no archive inspection. */
export const fileMeta = (file: File): string => `${formatBytes(file.size)} · ZIP`;

type Stage = ConversionStage & { hint: string };

const BASE: { label: string; hint: string }[] = [
  { label: "Chunked upload", hint: "8 MB chunks, resumable" },
  { label: "Finalize blob", hint: "content hash written" },
  { label: "Parse OBJ + MTL", hint: "geometry and materials" },
  { label: "Build LOD 0-2", hint: "three detail levels" },
  { label: "Compress textures", hint: "KTX2 artifacts" },
];

const PENDING_TIME = ["queued", "queued", "~1 min", "~2 min", "~1 min"];

/** Only the first two stages ever move on this page — the conversion pipeline runs after the redirect. */
function stageAt(index: number, phase: UploadPhase): { state: StageState; time: string } {
  if (index === 0) {
    if (phase === "uploading") return { state: "active", time: "running" };
    if (phase === "finalizing" || phase === "creating") return { state: "done", time: "done" };
  }
  if (index === 1) {
    if (phase === "finalizing") return { state: "active", time: "running" };
    if (phase === "creating") return { state: "done", time: "done" };
  }
  return { state: "pending", time: PENDING_TIME[index] ?? "queued" };
}

/** The five mocked stages, toned against the upload's own phase. */
export function stagesFor(phase: UploadPhase): Stage[] {
  return BASE.map((stage, i) => ({ ...stage, ...stageAt(i, phase) }));
}

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
 * Whether the progress panel shows, and what it says: only while the upload's
 * own bytes are moving (uploading/finalizing) — the conversion job runs after
 * the redirect and has nothing to report here yet.
 */
export function progressFor(
  phase: UploadPhase,
  progress: UploadProgress | null,
  samples: UploadSample[],
): { value: number; header: string; stats: string[] } | undefined {
  if (!progress || (phase !== "uploading" && phase !== "finalizing")) return undefined;
  const value = Math.round((progress.bytes / progress.total) * 100);
  return { value, ...progressLine(progress, uploadStats(samples, progress.total)) };
}

/** The aside's "before you submit" card — static, unaffected by phase or file. */
export const ARCHIVE_CHECKLIST: ChecklistItem[] = [
  { label: "Single ZIP, no nested archives", ok: true },
  { label: "OBJ references its MTL by relative path", ok: true },
  { label: "Textures next to the OBJ, not absolute paths", ok: true },
  { label: "Metres as units — the viewer measures in metres", ok: false },
];
