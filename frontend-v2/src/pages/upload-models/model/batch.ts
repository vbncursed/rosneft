import type { ConversionStage, StageState } from "@/entities/conversion";
import { deriveTitle, uploadStats, type UploadProgress, type UploadSample } from "@/entities/upload";
import { formatBytes } from "@/shared/lib/format-bytes";
import type { ChecklistItem } from "@/shared/ui/checklist";
import type { CoverageSegment } from "@/shared/ui/coverage-meter";

export type RowStatus = "queued" | "uploading" | "finalizing" | "creating" | "done" | "failed";

export type QueueRow = {
  id: string;
  file: File;
  title: string;
  status: RowStatus;
  /** 0–1, meaningful only while uploading. */
  progress: number;
  error?: string;
  thumbnail?: File;
};

/** A dropped file becomes a queued row with its title guessed from the filename. */
export function makeRow(file: File): QueueRow {
  return { id: crypto.randomUUID(), file, title: deriveTitle(file.name), status: "queued", progress: 0 };
}

/** Busy rows lock their title and block removal — the loop is mid-flight on them. */
export const isBusy = (status: RowStatus): boolean =>
  status === "uploading" || status === "finalizing" || status === "creating";

/** The batch meter's four shares: done / busy (any in-flight status) / queued / failed. */
export function batchMix(rows: QueueRow[]): CoverageSegment[] {
  const count = (pred: (r: QueueRow) => boolean) => rows.filter(pred).length;
  return [
    { tone: "ok", value: count((r) => r.status === "done"), label: "done" },
    { tone: "accent", value: count((r) => isBusy(r.status)), label: "uploading" },
    { tone: "neutral", value: count((r) => r.status === "queued"), label: "queued" },
    { tone: "bad", value: count((r) => r.status === "failed"), label: "failed" },
  ];
}

/** The three stat tiles: archive count, total size (as a ready-to-print hint), and failures. */
export function batchStats(rows: QueueRow[]): { archives: string; total: string; failed: number } {
  const totalBytes = rows.reduce((sum, r) => sum + r.file.size, 0);
  return {
    archives: String(rows.length),
    total: `${formatBytes(totalBytes)} total`,
    failed: rows.filter((r) => r.status === "failed").length,
  };
}

/** The Upload button is live only with something to run and every untouched title filled in. */
export const canRun = (rows: QueueRow[], running: boolean): boolean =>
  !running &&
  rows.some((r) => r.status === "queued" || r.status === "failed") &&
  rows.filter((r) => r.status !== "done").every((r) => r.title.trim() !== "");

const STAGE_LABELS = ["Chunked upload", "Finalize blob", "Upload thumbnail", "Create model + queue job"];

/** How many of the four steps a row's own status has already cleared. */
function doneUpTo(row: QueueRow): number {
  if (row.status === "done") return STAGE_LABELS.length;
  if (row.status === "creating") return row.thumbnail ? 2 : 3;
  if (row.status === "finalizing") return 1;
  return 0;
}

/** Which step is running right now, or -1 when nothing is. */
function activeIndex(row: QueueRow): number {
  if (row.status === "uploading") return 0;
  if (row.status === "finalizing") return 1;
  if (row.status === "creating") return row.thumbnail ? 2 : 3;
  return -1;
}

/** The "Current row" card's four stages, toned against the row's own status. */
export function currentRowStages(row: QueueRow): ConversionStage[] {
  const done = doneUpTo(row);
  const active = activeIndex(row);
  return STAGE_LABELS.map((label, i) => {
    const state: StageState = i < done ? "done" : i === active ? "active" : "pending";
    // The thumbnail step never ran on a row with none — "done" would claim
    // an upload that never happened.
    const time =
      i === 2 && !row.thumbnail && state === "done"
        ? "skipped"
        : state === "done"
          ? "done"
          : state === "pending"
            ? "queued"
            : i === 0
              ? `${Math.round(row.progress * 100)}%`
              : "running";
    return { label, state, time };
  });
}

export type CurrentStats = { chunk: string; speed: string; thumbnail?: string };

/** The current row's key/value grid: chunk count, instantaneous speed, and the thumbnail state. */
export function currentStats(
  progress: UploadProgress,
  samples: UploadSample[],
  hasThumbnail: boolean,
): CurrentStats {
  const { bytesPerSecond } = uploadStats(samples, progress.total);
  return {
    chunk: `${progress.chunk} / ${progress.chunks}`,
    speed: bytesPerSecond !== null ? `${formatBytes(bytesPerSecond)}/s` : "—",
    ...(hasThumbnail ? { thumbnail: "attached" } : {}),
  };
}

export const MODEL_CHECKLIST: ChecklistItem[] = [
  { label: "One ZIP per model — no nested archives", ok: true },
  { label: "Titles are unique across the library", ok: true },
  { label: "Thumbnails are square images, ≥512 px", ok: false },
  { label: "Model origin at its base, +Y up", ok: false },
];
