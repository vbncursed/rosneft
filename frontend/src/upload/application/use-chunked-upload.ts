"use client";

import { useCallback, useRef, useState } from "react";
import { runChunkedUpload } from "@/upload/application/run-chunked-upload";
import type { FinalizedBlob } from "@/upload/domain/session";
import { notify } from "@/shared/presentation/toast/use-toast";

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

// useChunkedUpload is a stateful wrapper around runChunkedUpload for
// single-file forms. Batch flows drive runChunkedUpload directly so
// each row owns its own progress.
export function useChunkedUpload(): UseChunkedUploadResult {
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [hash, setHash] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    setStatus("cancelled");
  }, []);

  const upload = useCallback(async (file: File): Promise<FinalizedBlob | null> => {
    setError(null);
    setHash(null);
    setProgress(0);
    const ctl = new AbortController();
    abortRef.current = ctl;
    try {
      const blob = await runChunkedUpload(file, {
        onStage: (s) => setStatus(s),
        onProgress: (p) => setProgress(p),
        signal: ctl.signal,
      });
      setHash(blob.hash);
      setStatus("succeeded");
      return blob;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "upload failed";
      setError(msg);
      setStatus("failed");
      notify.error(msg);
      return null;
    } finally {
      abortRef.current = null;
    }
  }, []);

  return { status, progress, error, hash, upload, cancel };
}
