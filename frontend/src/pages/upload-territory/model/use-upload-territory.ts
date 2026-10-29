import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import type { ConversionStage } from "@/entities/conversion";
import { createTerritory } from "@/entities/territory";
import { runChunkedUpload, slugPreview, useUploadRun } from "@/entities/upload";
import { meQuery } from "@/entities/user";
import { can } from "@/shared/session";
import type { ChecklistItem } from "@/shared/ui/checklist";
import { ARCHIVE_CHECKLIST, canSubmit, stagesFor, type UploadForm, type UploadPhase } from "./upload-form";

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
 * creating -> (navigates to the territory's conversion page) | picked (on a
 * throw, toasted, or a cancel, silent — the file is kept either way).
 */
export function useUploadTerritory(): UploadTerritoryState {
  const me = useQuery(meQuery).data ?? null;
  const client = useQueryClient();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<UploadPhase>("idle");
  const [form, setForm] = useState<UploadForm>(EMPTY_FORM);
  const upload = useUploadRun();
  const { file } = upload;

  const onFiles = (files: File[]) => {
    if (upload.pick(files)) setPhase("picked");
  };

  const onReplace = () => {
    upload.clear();
    setPhase("idle");
  };

  const onForm = (patch: Partial<UploadForm>) => setForm((prev) => ({ ...prev, ...patch }));

  const onSubmit = () => {
    if (!canSubmit(phase, file, form)) return;
    setPhase("uploading");

    runChunkedUpload(
      file,
      upload.begin((stage) => {
        if (stage === "finalizing") setPhase("finalizing");
      }),
    )
      .then((finalized) => {
        setPhase("creating");
        return createTerritory({
          title: form.title.trim(),
          ...(form.description.trim() ? { description: form.description.trim() } : {}),
          ...(form.panoramaUrl.trim() ? { externalPanoramaUrl: form.panoramaUrl.trim() } : {}),
          sourceBlobHash: finalized.hash,
        });
      })
      .then(({ territory, job }) => {
        // The catalog and the jobs strip trust their lists for a minute; this
        // territory and its job are not in either yet.
        void client.invalidateQueries({ queryKey: ["territories"] });
        void client.invalidateQueries({ queryKey: ["jobs"] });
        return navigate({ href: `/territories/${encodeURIComponent(territory.slug)}?jobId=${job.id}` });
      })
      .catch((err: unknown) => {
        setPhase("picked");
        upload.fail(err);
      });
  };

  const onCancel = upload.cancel;

  return {
    phase,
    file,
    form,
    onForm,
    onFiles,
    onReplace,
    slug: slugPreview(form.title),
    progress: upload.view(phase === "uploading" || phase === "finalizing"),
    onSubmit,
    onCancel,
    canUpload: can(me, "territory:create"),
    checks: ARCHIVE_CHECKLIST,
    stages: stagesFor(phase),
  };
}
