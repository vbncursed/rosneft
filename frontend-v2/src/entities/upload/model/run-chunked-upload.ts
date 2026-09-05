import { appendChunk, finalizeUpload, initiateUpload, type FinalizedBlob } from "../api/upload-gateway";

export const CHUNK_SIZE = 8 * 1024 * 1024;

export type UploadProgress = { bytes: number; total: number; chunk: number; chunks: number };
export type UploadStage = "initiating" | "uploading" | "finalizing";

export type RunChunkedUploadOpts = {
  onStage?: (stage: UploadStage) => void;
  onProgress?: (progress: UploadProgress) => void;
  signal?: AbortSignal;
};

/**
 * Drives the gateway's resumable upload protocol as a pure async function, so
 * multiple uploads can run with independent state. Starts at the session's
 * own offset — a mid-session resume within the tab sends only what is left.
 * Aborting via `signal` between chunks rejects rather than sending a doomed
 * PATCH; callers wire onStage/onProgress to their own UI.
 */
export async function runChunkedUpload(
  file: File,
  opts: RunChunkedUploadOpts = {},
): Promise<FinalizedBlob> {
  const { onStage, onProgress, signal } = opts;
  onStage?.("initiating");
  const session = await initiateUpload(file.size, file.type || "application/zip");

  onStage?.("uploading");
  const total = file.size;
  const chunks = Math.max(1, Math.ceil(total / CHUNK_SIZE));
  let offset = session.offset;
  while (offset < total) {
    if (signal?.aborted) throw new Error("upload aborted");
    const slice = file.slice(offset, Math.min(offset + CHUNK_SIZE, total));
    offset = await appendChunk(session.id, offset, slice, signal);
    onProgress?.({ bytes: offset, total, chunk: Math.ceil(offset / CHUNK_SIZE), chunks });
  }

  onStage?.("finalizing");
  return finalizeUpload(session.id);
}
