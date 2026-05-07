import { httpPost } from "@/shared/infrastructure/http/client";
import type { components } from "@/shared/infrastructure/api/dto";
import type { UploadSession, FinalizedBlob } from "@/upload/domain/session";

type UploadSessionDto = components["schemas"]["UploadSession"];
type UploadFinalizedDto = components["schemas"]["UploadFinalized"];

function mapSession(d: UploadSessionDto): UploadSession {
  return { id: d.id, size: d.size, offset: d.offset, contentType: d.contentType };
}

// initiateUpload starts a new chunked-upload session and returns its
// server-assigned ID. Subsequent appendChunk / finalizeUpload calls key
// off this ID.
export async function initiateUpload(
  size: number,
  contentType = "application/zip",
): Promise<UploadSession> {
  const data = await httpPost<UploadSessionDto>("/api/uploads", { size, contentType });
  return mapSession(data);
}

// appendChunk PATCHes one slice of bytes at the given offset. Server
// rejects out-of-order writes and writes that would exceed the session's
// declared size.
export async function appendChunk(
  id: string,
  offset: number,
  chunk: Blob,
  signal?: AbortSignal,
): Promise<number> {
  const res = await fetch(`/api/uploads/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/octet-stream",
      "Upload-Offset": String(offset),
    },
    body: chunk,
    signal,
  });
  if (!res.ok) {
    throw new Error(`upload chunk failed: ${res.status}`);
  }
  const next = res.headers.get("Upload-Offset");
  return next ? Number(next) : offset + chunk.size;
}

// finalizeUpload closes the session and publishes the bytes to BlobStore.
export async function finalizeUpload(id: string): Promise<FinalizedBlob> {
  const data = await httpPost<UploadFinalizedDto>(
    `/api/uploads/${encodeURIComponent(id)}/finalize`,
  );
  return { hash: data.hash, size: data.size };
}

// getUploadStatus reports the current offset for resumability. Returns
// null if the session is unknown (deleted or never existed).
export async function getUploadStatus(
  id: string,
): Promise<{ offset: number; size: number } | null> {
  const res = await fetch(`/api/uploads/${encodeURIComponent(id)}`, { method: "HEAD" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`status: ${res.status}`);
  return {
    offset: Number(res.headers.get("Upload-Offset") ?? "0"),
    size: Number(res.headers.get("Upload-Length") ?? "0"),
  };
}

// abortUpload discards an in-progress session. Idempotent.
export async function abortUpload(id: string): Promise<void> {
  await fetch(`/api/uploads/${encodeURIComponent(id)}`, { method: "DELETE" });
}

