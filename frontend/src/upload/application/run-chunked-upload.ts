import {
  appendChunk,
  finalizeUpload,
  initiateUpload,
} from "@/upload/infrastructure/upload-gateway";
import type { FinalizedBlob } from "@/upload/domain/session";

const CHUNK_SIZE = 8 * 1024 * 1024;

export type UploadStage = "initiating" | "uploading" | "finalizing";

export interface RunUploadOpts {
  onStage?: (stage: UploadStage) => void;
  onProgress?: (ratio: number) => void;
  signal?: AbortSignal;
}

// runChunkedUpload drives the gateway's resumable upload protocol as a
// pure async function so multiple uploads can run with independent
// state. Callers wire onStage/onProgress to their own UI; aborting via
// `signal` interrupts the in-flight PATCH and reads as a thrown error.
export async function runChunkedUpload(
  file: File,
  opts: RunUploadOpts = {},
): Promise<FinalizedBlob> {
  const { onStage, onProgress, signal } = opts;
  onStage?.("initiating");
  const session = await initiateUpload(
    file.size,
    file.type || "application/zip",
  );

  onStage?.("uploading");
  let offset = session.offset;
  while (offset < file.size) {
    if (signal?.aborted) throw new Error("upload aborted");
    const slice = file.slice(offset, Math.min(offset + CHUNK_SIZE, file.size));
    offset = await appendChunk(session.id, offset, slice, signal);
    onProgress?.(offset / file.size);
  }

  onStage?.("finalizing");
  return finalizeUpload(session.id);
}
