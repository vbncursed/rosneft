import { UploadProgressPanel } from "@/entities/upload";
import { ThemeToggle } from "@/features/theme-toggle";
import { Callout } from "@/shared/ui/callout";
import { DropZone } from "@/shared/ui/drop-zone";
import { FileCard } from "@/shared/ui/file-card";
import { PageHeader } from "@/widgets/page-header";
import { fileMeta, isBusy, type ReplaceSourcePageProps } from "../model/replace-form";
import { ReplaceAside } from "./replace-aside";
import { SourcePair } from "./source-pair";

export type { ReplaceSourcePageProps } from "../model/replace-form";

export function ReplaceSourcePage({
  territory,
  currentSize,
  phase,
  file,
  progress,
  onFiles,
  onReplace,
  onSubmit,
  onCancel,
  canReplace,
  stages,
}: ReplaceSourcePageProps) {
  return (
    <>
      <PageHeader
        size="lg"
        eyebrow="Replace source"
        title={`Swap the 3D source of ${territory.title}`}
        description="Upload a new ZIP (OBJ + MTL + textures). The mesh re-converts in place and the territory keeps its identity — every placed object stays anchored. Use this for an updated scan of the same site."
        back={{ label: "← Territory catalog", href: "/territories" }}
        action={<ThemeToggle variant="compact" />}
      />

      {canReplace ? (
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(420px,1fr)_minmax(300px,380px)]">
          <div className="flex flex-col gap-4">
            <SourcePair territory={territory} currentSize={currentSize} file={file} />

            <div className="flex flex-col gap-4 rounded-card border border-line bg-panel p-[22px]">
              <div className="flex items-baseline gap-3">
                <span className="text-[13px] font-semibold">New archive</span>
                <span className="font-mono text-[10px] text-muted">.zip only · OBJ + MTL + textures</span>
                <span className="h-px flex-1 bg-line" />
              </div>

              {file ? (
                <FileCard
                  name={file.name}
                  meta={fileMeta(file)}
                  onReplace={phase === "picked" ? onReplace : undefined}
                />
              ) : (
                <DropZone
                  label="Drop the new ZIP here"
                  hint="Or pick one"
                  buttonLabel="Choose file"
                  accept=".zip,application/zip"
                  onFiles={onFiles}
                />
              )}

              <UploadProgressPanel
                busy={isBusy(phase)}
                progress={progress}
                canSubmit={phase === "picked"}
                submitLabel="Replace source"
                cancelLabel="Cancel upload"
                onSubmit={onSubmit}
                onCancel={onCancel}
              />
            </div>

            <Callout tone="warn" icon="warning" size="lg">
              <>
                <strong className="block text-[13px] font-semibold">
                  The territory goes back to converting
                </strong>
                <span className="mt-[5px] block text-xs leading-[1.5] text-fg">
                  While the new mesh is processed the viewer shows the conversion screen. Placements
                  are not deleted, but coordinates are kept as-is — if the new scan shifted the
                  origin, objects will need re-anchoring.
                </span>
              </>
            </Callout>
          </div>

          <ReplaceAside stages={stages} />
        </div>
      ) : (
        <Callout tone="warn">Replacing a source needs territory:write.</Callout>
      )}
    </>
  );
}
