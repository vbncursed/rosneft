import type { ConversionStage } from "@/entities/conversion";
import { UploadProgressPanel } from "@/entities/upload";
import { ThemeToggle } from "@/features/theme-toggle";
import { Callout } from "@/shared/ui/callout";
import type { ChecklistItem } from "@/shared/ui/checklist";
import { DropZone } from "@/shared/ui/drop-zone";
import { FileCard } from "@/shared/ui/file-card";
import { PageHeader } from "@/widgets/page-header";
import { canSubmit, fileMeta, type UploadForm, type UploadPhase } from "../model/upload-form";
import { UploadAside } from "./upload-aside";
import { UploadDetails } from "./upload-details";

export type UploadTerritoryPageProps = {
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
  /** Whether the viewer holds territory:write — without it the whole form is replaced by a callout. */
  canUpload: boolean;
  checks: ChecklistItem[];
  stages: (ConversionStage & { hint: string })[];
};

export function UploadTerritoryPage({
  phase,
  file,
  form,
  onForm,
  onFiles,
  onReplace,
  slug,
  progress,
  onSubmit,
  onCancel,
  canUpload,
  checks,
  stages,
}: UploadTerritoryPageProps) {
  return (
    <>
      <PageHeader
        size="lg"
        eyebrow="Upload · single territory"
        title="New territory"
        description="One ZIP per territory: OBJ + MTL + textures. Uploads in 8 MB chunks and resumes after a network drop."
        back={{ label: "← Territory catalog", href: "/territories" }}
        action={<ThemeToggle variant="compact" />}
      />

      {canUpload ? (
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(420px,1fr)_minmax(300px,380px)]">
          <div className="flex flex-col gap-4">
            {file ? (
              <FileCard
                name={file.name}
                meta={fileMeta(file)}
                onReplace={phase === "picked" ? onReplace : undefined}
              />
            ) : (
              <DropZone
                label="Drop a ZIP here"
                hint="Or pick one"
                buttonLabel="Choose file"
                accept=".zip,application/zip"
                onFiles={onFiles}
              />
            )}

            <UploadDetails form={form} onForm={onForm} slug={slug} />

            <UploadProgressPanel
              busy={phase === "uploading" || phase === "finalizing" || phase === "creating"}
              progress={progress}
              canSubmit={canSubmit(phase, file, form)}
              submitLabel="Upload territory"
              onSubmit={onSubmit}
              onCancel={phase === "uploading" || phase === "finalizing" ? onCancel : undefined}
            />
          </div>

          <UploadAside stages={stages} checks={checks} />
        </div>
      ) : (
        <Callout tone="warn">Uploading a territory needs territory:write.</Callout>
      )}
    </>
  );
}
