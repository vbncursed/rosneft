import { useRef, useState } from "react";
import { messageOf } from "@/shared/api";
import { notify } from "@/shared/lib/notify";
import { progressFor, type UploadProgressView } from "./progress-line";
import type { RunChunkedUploadOpts, UploadProgress, UploadStage } from "./run-chunked-upload";
import type { UploadSample } from "./upload-stats";

/**
 * The file, progress and speed samples of one chunked upload for the pages
 * that run it as a multi-phase state machine (Upload Territory, Replace
 * Source). The phase itself stays with the page — their last phase differs.
 */
export function useUploadRun() {
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  // State, not a ref: `view` reads it during render.
  const [samples, setSamples] = useState<UploadSample[]>([]);
  const controller = useRef<AbortController | null>(null);

  /** Keeps the first file; null when there is none to keep. */
  const pick = (files: File[]): File | null => {
    const picked = files[0];
    if (!picked) return null;
    setFile(picked);
    setProgress(null);
    return picked;
  };

  const clear = () => {
    setFile(null);
    setProgress(null);
  };

  /** The options for `runChunkedUpload(file, …)`: a fresh abort signal, and progress and samples routed here. */
  const begin = (onStage: (stage: UploadStage) => void): RunChunkedUploadOpts => {
    const ac = new AbortController();
    controller.current = ac;
    setSamples([{ at: Date.now(), bytes: 0 }]);
    // A retry after a cancel/failure must not show the previous attempt's
    // numbers until this run's own onProgress has something to say.
    setProgress(null);
    return {
      signal: ac.signal,
      onStage,
      onProgress: (p) => {
        setSamples((prev) => [...prev, { at: Date.now(), bytes: p.bytes }]);
        setProgress(p);
      },
    };
  };

  /** A deliberate cancel is not a failure to report — only a genuine throw gets a toast. */
  const fail = (err: unknown) => {
    if (controller.current?.signal.aborted) return;
    notify.error(messageOf(err));
  };

  const cancel = () => controller.current?.abort();

  const view = (active: boolean): UploadProgressView | undefined => progressFor(active, progress, samples);
  const percent = progress ? Math.round((progress.bytes / progress.total) * 100) : null;

  return { file, pick, clear, begin, fail, cancel, view, percent };
}
