import { useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import type { ConversionStage } from "@/entities/conversion";
import { createTerritory } from "@/entities/territory";
import { runChunkedUpload, slugPreview, type UploadProgress, type UploadSample } from "@/entities/upload";
import { meQuery } from "@/entities/user";
import { messageOf } from "@/shared/api";
import { leaveTo } from "@/shared/lib/leave";
import { notify } from "@/shared/lib/notify";
import { can } from "@/shared/session";
import type { ChecklistItem } from "@/shared/ui/checklist";
import { ARCHIVE_CHECKLIST, progressFor, stagesFor, type UploadForm, type UploadPhase } from "./upload-form";

export type UploadTerritoryState = {
  phase: UploadPhase;
  file: File | null;
  form: UploadForm;
  onForm: (patch: Partial<UploadForm>) => void;
  onFiles: (files: File[]) => void;
  onReplace: () => void;
  slug: string;
  progress?: { value: number; header: string; stats: string[] };
  onSubmit: () => void;
  onCancel: () => void;
  canUpload: boolean;
  checks: ChecklistItem[];
  stages: (ConversionStage & { hint: string })[];
};

const EMPTY_FORM: UploadForm = { title: "", description: "", panoramaUrl: "" };

/**
 * The upload state machine: idle -> picked -> uploading -> finalizing ->
 * creating -> (leaves for the old SPA's conversion screen) | picked (on a
 * throw, toasted, or a cancel, silent — the file is kept either way).
 */
export function useUploadTerritory(): UploadTerritoryState {
  const me = useQuery(meQuery).data ?? null;
  const [phase, setPhase] = useState<UploadPhase>("idle");
  const [file, setFile] = useState<File | null>(null);
  const [form, setForm] = useState<UploadForm>(EMPTY_FORM);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  // State, not a ref: `progressFor` below reads it during render, and a ref's
  // `current` is not something render is supposed to touch.
  const [samples, setSamples] = useState<UploadSample[]>([]);
  const controller = useRef<AbortController | null>(null);

  const onFiles = (files: File[]) => {
    const picked = files[0];
    if (!picked) return;
    setFile(picked);
    setProgress(null);
    setPhase("picked");
  };

  const onReplace = () => {
    setFile(null);
    setProgress(null);
    setPhase("idle");
  };

  const onForm = (patch: Partial<UploadForm>) => setForm((prev) => ({ ...prev, ...patch }));

  const onSubmit = () => {
    if (phase !== "picked" || !file || form.title.trim() === "") return;
    const ac = new AbortController();
    controller.current = ac;
    setSamples([{ at: Date.now(), bytes: 0 }]);
    setPhase("uploading");

    runChunkedUpload(file, {
      signal: ac.signal,
      onStage: (stage) => {
        if (stage === "finalizing") setPhase("finalizing");
      },
      onProgress: (p) => {
        setSamples((prev) => [...prev, { at: Date.now(), bytes: p.bytes }]);
        setProgress(p);
      },
    })
      .then((finalized) => {
        setPhase("creating");
        return createTerritory({
          title: form.title.trim(),
          ...(form.description.trim() ? { description: form.description.trim() } : {}),
          ...(form.panoramaUrl.trim() ? { externalPanoramaUrl: form.panoramaUrl.trim() } : {}),
          sourceBlobHash: finalized.hash,
        });
      })
      .then(({ territory, job }) => leaveTo(`/territories/${territory.slug}?jobId=${job.id}`))
      .catch((err: unknown) => {
        setPhase("picked");
        // A deliberate cancel is not a failure to report — only a genuine
        // throw (a dropped connection, a gateway refusal) gets a toast.
        if (ac.signal.aborted) return;
        notify.error(messageOf(err));
      });
  };

  const onCancel = () => controller.current?.abort();

  return {
    phase,
    file,
    form,
    onForm,
    onFiles,
    onReplace,
    slug: slugPreview(form.title),
    progress: progressFor(phase, progress, samples),
    onSubmit,
    onCancel,
    canUpload: can(me, "territory:write"),
    checks: ARCHIVE_CHECKLIST,
    stages: stagesFor(phase),
  };
}
