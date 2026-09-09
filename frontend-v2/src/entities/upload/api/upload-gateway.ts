import { ensureCsrfToken, httpDelete, httpPost } from "@/shared/api";
import type { components } from "@/shared/api/dto";

const API_BASE = import.meta.env.VITE_API_URL;

type UploadSessionDto = components["schemas"]["UploadSession"];
type UploadFinalizedDto = components["schemas"]["UploadFinalized"];

export type UploadSession = { id: string; size: number; offset: number; contentType?: string };
export type FinalizedBlob = { hash: string; size: number };

function toSession(d: UploadSessionDto): UploadSession {
  return {
    id: d.id,
    size: d.size,
    offset: d.offset,
    ...(d.contentType ? { contentType: d.contentType } : {}),
  };
}

/** Starts a new chunked-upload session; appendChunk/finalizeUpload key off its id. */
export const initiateUpload = async (
  size: number,
  contentType = "application/zip",
): Promise<UploadSession> => toSession(await httpPost<UploadSessionDto>("/api/uploads", { size, contentType }));

// Raw fetch, not the shared JSON client: the body is a Blob sent as
// application/octet-stream with a custom Upload-Offset header, none of which
// the client's JSON-only helpers carry. The session cookie rides on this
// same-origin fetch on its own; ensureCsrfToken proves the request came from
// our own page, same as every other mutation.
async function uploadHeaders(extra: Record<string, string>): Promise<Record<string, string>> {
  const csrf = await ensureCsrfToken();
  return { ...(csrf ? { "X-CSRF-Token": csrf } : {}), ...extra };
}

/** PATCHes one slice at `offset`. The gateway rejects out-of-order or oversize writes. */
export async function appendChunk(
  id: string,
  offset: number,
  chunk: Blob,
  signal?: AbortSignal,
): Promise<number> {
  const res = await fetch(`${API_BASE}/api/uploads/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: await uploadHeaders({
      "Content-Type": "application/octet-stream",
      "Upload-Offset": String(offset),
    }),
    body: chunk,
    signal,
  });
  if (!res.ok) throw new Error(`upload chunk failed: ${res.status}`);
  const next = res.headers.get("Upload-Offset");
  return next ? Number(next) : offset + chunk.size;
}

/** Closes the session and publishes the bytes to BlobStore. */
export const finalizeUpload = (id: string): Promise<FinalizedBlob> =>
  httpPost<UploadFinalizedDto>(`/api/uploads/${encodeURIComponent(id)}/finalize`);

/** Discards an in-progress session. Idempotent. */
export const abortUpload = (id: string): Promise<void> =>
  httpDelete(`/api/uploads/${encodeURIComponent(id)}`);
