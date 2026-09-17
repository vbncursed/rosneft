import { useRef, useState } from "react";
import { messageOf } from "@/shared/api";
import { notify } from "@/shared/lib/notify";
import type { FinalizedBlob } from "../api/upload-gateway";
import { runChunkedUpload } from "./run-chunked-upload";

export type FileUploadState =
  | { stage: "idle"; file: null }
  | { stage: "picked"; file: File }
  | { stage: "uploading"; file: File; percent: number; label: string }
  | { stage: "creating"; file: File }
  | { stage: "refused"; file: null; reason: string };

export type FileUploadOptions = {
  /** Reads the file's leading bytes; the extension and the declared MIME type are hints only. */
  sniff: (head: Uint8Array) => boolean;
  /** What to say when the sniff says no — the reader sees this, not an error. */
  refusal: string;
  headBytes?: number;
  /** The line under the file card while the bytes travel, e.g. "Reading EXIF · 38 %". */
  uploadingLabel: (percent: number) => string;
};

const IDLE: FileUploadState = { stage: "idle", file: null };

/**
 * One file, sniffed then streamed, for the panorama and document uploads
 * alike: `pick` refuses what the sniff rejects before a byte leaves the tab,
 * `run` carries the blob into whatever the caller creates from it, and
 * `cancel` gives the gateway's session back.
 *
 * `run` resolves null rather than throwing on every failure path — a cancel is
 * silent and a refusal is toasted, and neither is something a submit handler
 * should have to catch.
 */
export function useFileUpload({ sniff, refusal, headBytes = 8, uploadingLabel }: FileUploadOptions) {
  const [state, setState] = useState<FileUploadState>(IDLE);
  const controller = useRef<AbortController | null>(null);
  // `run` reads the picked file from here: a fresh closure per render would
  // otherwise capture whatever state the render that built it saw.
  const picked = useRef<File | null>(null);

  const pick = async (file: File) => {
    const head = new Uint8Array(await file.slice(0, headBytes).arrayBuffer());
    if (!sniff(head)) {
      picked.current = null;
      setState({ stage: "refused", file: null, reason: refusal });
      return;
    }
    picked.current = file;
    setState({ stage: "picked", file });
  };

  const clear = () => {
    picked.current = null;
    setState(IDLE);
  };

  const cancel = () => controller.current?.abort();

  const run = async <T,>(work: (blob: FinalizedBlob, file: File) => Promise<T>): Promise<T | null> => {
    const file = picked.current;
    if (!file) return null;
    const ac = new AbortController();
    controller.current = ac;
    setState({ stage: "uploading", file, percent: 0, label: uploadingLabel(0) });

    try {
      const blob = await runChunkedUpload(file, {
        signal: ac.signal,
        onProgress: ({ bytes, total }) => {
          const percent = total === 0 ? 100 : Math.round((bytes / total) * 100);
          setState({ stage: "uploading", file, percent, label: uploadingLabel(percent) });
        },
      });
      setState({ stage: "creating", file });
      const created = await work(blob, file);
      picked.current = null;
      setState(IDLE);
      return created;
    } catch (err) {
      // The file stays picked either way, so a retry costs one click.
      setState({ stage: "picked", file });
      // A deliberate cancel is not a failure to report.
      if (!ac.signal.aborted) notify.error(messageOf(err));
      return null;
    } finally {
      controller.current = null;
    }
  };

  return { state, pick, clear, run, cancel };
}
