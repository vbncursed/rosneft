import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { createModel, modelPath } from "@/entities/model";
import { CHUNK_SIZE, runChunkedUpload, type UploadProgress, type UploadSample } from "@/entities/upload";
import { meQuery } from "@/entities/user";
import { messageOf } from "@/shared/api";
import { leaveTo } from "@/shared/lib/leave";
import { notify } from "@/shared/lib/notify";
import { can } from "@/shared/session";
import type { ChecklistItem } from "@/shared/ui/checklist";
import type { CoverageSegment } from "@/shared/ui/coverage-meter";
import {
  batchMix,
  batchStats,
  canRun,
  currentStats,
  isBusy,
  MODEL_CHECKLIST,
  makeRow,
  type CurrentStats,
  type QueueRow,
} from "./batch";

export type UploadModelsState = {
  rows: QueueRow[];
  onFiles: (files: File[]) => void;
  onTitle: (id: string, title: string) => void;
  onRemove: (id: string) => void;
  onThumbnail: (id: string, file: File | null) => void;
  onClearDone: () => void;
  onRun: () => void;
  onCancel: () => void;
  running: boolean;
  current?: { row: QueueRow; progress: UploadProgress; stats: CurrentStats };
  mix: CoverageSegment[];
  stats: { archives: string; total: string; failed: number };
  checks: ChecklistItem[];
  canUpload: boolean;
  failedNames: string[];
};

/**
 * Drives the batch queue: each row runs `runChunkedUpload` (main file), then
 * its thumbnail if any, then `createModel`, one row at a time. A throw fails
 * that row with the message and the loop moves on; a cancel fails the row
 * "cancelled" and stops the loop outright.
 */
export function useUploadModels(): UploadModelsState {
  const me = useQuery(meQuery).data ?? null;
  const navigate = useNavigate();
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [running, setRunning] = useState(false);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [samples, setSamples] = useState<UploadSample[]>([]);
  // The run loop reads rows fresh on every iteration — a later row's title
  // may still be edited while an earlier one is uploading — but state set in
  // the same tick isn't visible through the closed-over `rows` variable, so a
  // ref mirrors it for the loop to read.
  const rowsRef = useRef<QueueRow[]>(rows);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  const patchRow = (id: string, patch: Partial<QueueRow>) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const onFiles = (files: File[]) => setRows((prev) => [...prev, ...files.map(makeRow)]);
  const onTitle = (id: string, title: string) => patchRow(id, { title });
  const onRemove = (id: string) => setRows((prev) => prev.filter((r) => r.id !== id || isBusy(r.status)));
  const onThumbnail = (id: string, file: File | null) => patchRow(id, { thumbnail: file ?? undefined });
  const onClearDone = () => setRows((prev) => prev.filter((r) => r.status !== "done"));
  const onCancel = () => controller.current?.abort();

  const onRun = () => {
    if (!canRun(rows, running)) return;
    setRunning(true);
    void run();
  };

  async function run() {
    const ids = rowsRef.current
      .filter((r) => r.status === "queued" || r.status === "failed")
      .map((r) => r.id);
    const created: { slug: string; jobId: string }[] = [];
    // A cancel means "stop and leave the queue as it is" — even a row or two
    // already created must not trigger the finish-line redirect.
    let cancelled = false;

    for (const id of ids) {
      const row = rowsRef.current.find((r) => r.id === id);
      if (!row) continue;
      const ac = new AbortController();
      controller.current = ac;
      setCurrentId(id);
      // Seeded before the first byte moves — onProgress only fires after a
      // chunk lands, and without this the current-row card and "Uploading k
      // of n…" are both blank for that whole first chunk.
      const chunks = Math.max(1, Math.ceil(row.file.size / CHUNK_SIZE));
      setProgress({ bytes: 0, total: row.file.size, chunk: 0, chunks });
      setSamples([{ at: Date.now(), bytes: 0 }]);
      patchRow(id, { status: "uploading", error: undefined, progress: 0 });

      try {
        const finalized = await runChunkedUpload(row.file, {
          signal: ac.signal,
          onStage: (stage) => {
            if (stage === "finalizing") patchRow(id, { status: "finalizing" });
          },
          onProgress: (p) => {
            setProgress(p);
            setSamples((prev) => [...prev, { at: Date.now(), bytes: p.bytes }]);
            patchRow(id, { progress: p.bytes / p.total });
          },
        });

        patchRow(id, { status: "creating" });
        let thumbnailBlobHash: string | undefined;
        if (row.thumbnail) {
          const thumb = await runChunkedUpload(row.thumbnail, { signal: ac.signal });
          thumbnailBlobHash = thumb.hash;
        }
        const { model, job } = await createModel({
          title: row.title.trim(),
          sourceBlobHash: finalized.hash,
          ...(thumbnailBlobHash ? { thumbnailBlobHash } : {}),
        });
        patchRow(id, { status: "done", progress: 1 });
        created.push({ slug: model.slug, jobId: job.id });
        // The batch cancel button cannot abort createModel's own request (it
        // takes no signal) — a cancel that lands during that last call still
        // finishes the row, but no further row should start after it.
        if (ac.signal.aborted) {
          cancelled = true;
          break;
        }
      } catch (err) {
        if (ac.signal.aborted) {
          patchRow(id, { status: "failed", error: "cancelled" });
          cancelled = true;
          break;
        }
        const message = messageOf(err);
        patchRow(id, { status: "failed", error: message });
        notify.error(`${row.file.name}: ${message}`);
      }
    }

    setRunning(false);
    setCurrentId(null);
    setProgress(null);
    if (cancelled) return;
    if (created.length === 1) leaveTo(`${modelPath(created[0].slug)}?jobId=${created[0].jobId}`);
    else if (created.length > 1) void navigate({ to: "/models" });
  }

  const currentRow = currentId ? rows.find((r) => r.id === currentId) : undefined;
  const current =
    currentRow && progress
      ? { row: currentRow, progress, stats: currentStats(progress, samples, !!currentRow.thumbnail) }
      : undefined;

  return {
    rows,
    onFiles,
    onTitle,
    onRemove,
    onThumbnail,
    onClearDone,
    onRun,
    onCancel,
    running,
    current,
    mix: batchMix(rows),
    stats: batchStats(rows),
    checks: MODEL_CHECKLIST,
    canUpload: can(me, "model:write"),
    // A deliberate cancel is not a "fix the archive and re-add it" failure —
    // it does not get the bad-callout treatment.
    failedNames: rows.filter((r) => r.status === "failed" && r.error !== "cancelled").map((r) => r.file.name),
  };
}
