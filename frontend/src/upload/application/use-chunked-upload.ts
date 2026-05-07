"use client";

import { useCallback, useRef, useState } from "react";
import {
  abortUpload,
  appendChunk,
  finalizeUpload,
  initiateUpload,
} from "@/upload/infrastructure/upload-gateway";
import type { FinalizedBlob } from "@/upload/domain/session";

// 8 MB chunks — matches the gateway's WriteTimeout budget for one PATCH
// while keeping resume granularity tight enough for a flaky uplink.
const CHUNK_SIZE = 8 * 1024 * 1024;

export type UploadStatus =
  | "idle"
  | "initiating"
  | "uploading"
  | "finalizing"
  | "succeeded"
  | "failed"
  | "cancelled";

export interface UseChunkedUploadResult {
  status: UploadStatus;
  progress: number; // 0..1
  error: string | null;
  hash: string | null;
  upload: (file: File) => Promise<FinalizedBlob | null>;
  cancel: () => void;
}

// useChunkedUpload drives the gateway's resumable upload protocol:
// initiate → loop appendChunk → finalize. Returns the finalized blob
// hash on success. The cancel button aborts both the in-flight PATCH
// (via AbortController) and the server-side session.
export function useChunkedUpload(): UseChunkedUploadResult {
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [hash, setHash] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const sessionIdRef = useRef<string | null>(null);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    if (sessionIdRef.current) {
      abortUpload(sessionIdRef.current).catch(() => {});
    }
    setStatus("cancelled");
  }, []);

  const upload = useCallback(async (file: File): Promise<FinalizedBlob | null> => {
    setError(null);
    setHash(null);
    setProgress(0);
    setStatus("initiating");
    try {
      const session = await initiateUpload(file.size, file.type || "application/zip");
      sessionIdRef.current = session.id;
      setStatus("uploading");

      let offset = session.offset;
      while (offset < file.size) {
        const ctl = new AbortController();
        abortRef.current = ctl;
        const slice = file.slice(offset, Math.min(offset + CHUNK_SIZE, file.size));
        offset = await appendChunk(session.id, offset, slice, ctl.signal);
        setProgress(offset / file.size);
      }

      setStatus("finalizing");
      const blob = await finalizeUpload(session.id);
      setHash(blob.hash);
      setStatus("succeeded");
      return blob;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "upload failed";
      setError(msg);
      setStatus("failed");
      return null;
    } finally {
      abortRef.current = null;
      sessionIdRef.current = null;
    }
  }, []);

  return { status, progress, error, hash, upload, cancel };
}
