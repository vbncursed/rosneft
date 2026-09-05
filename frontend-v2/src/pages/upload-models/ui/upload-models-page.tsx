import { CHUNK_SIZE, type UploadProgress } from "@/entities/upload";
import { StatTile } from "@/entities/metric";
import { ThemeToggle } from "@/features/theme-toggle";
import { formatBytes } from "@/shared/lib/format-bytes";
import { Button } from "@/shared/ui/button";
import { Callout } from "@/shared/ui/callout";
import type { ChecklistItem } from "@/shared/ui/checklist";
import { CoverageMeter, type CoverageSegment } from "@/shared/ui/coverage-meter";
import { DropZone } from "@/shared/ui/drop-zone";
import { SectionHeading } from "@/shared/ui/section-heading";
import { PageHeader } from "@/widgets/page-header";
import { canRun, type CurrentStats, type QueueRow } from "../model/batch";
import { QueueRowCard } from "./queue-row";
import { UploadAside } from "./upload-aside";

export type UploadModelsPageProps = {
  rows: QueueRow[];
  onFiles: (files: File[]) => void;
  onTitle: (id: string, title: string) => void;
  onRemove: (id: string) => void;
  onThumbnail: (id: string, file: File | null) => void;
  onClearDone: () => void;
  onRun: () => void;
  onCancel: () => void;
  running: boolean;
  current?: { row: QueueRow; progress: UploadProgress; stats: CurrentStats };
  mix: CoverageSegment[];
  stats: { archives: string; total: string; failed: number };
  checks: ChecklistItem[];
  /** Whether the viewer holds model:write — without it the whole form is replaced by a callout. */
  canUpload: boolean;
  failedNames: string[];
};

export function UploadModelsPage({
  rows,
  onFiles,
  onTitle,
  onRemove,
  onThumbnail,
  onClearDone,
  onRun,
  onCancel,
  running,
  current,
  mix,
  stats,
  checks,
  canUpload,
  failedNames,
}: UploadModelsPageProps) {
  const doneCount = rows.filter((r) => r.status === "done").length;
  const canSubmit = canRun(rows, running);
  const currentIndex = current ? rows.findIndex((r) => r.id === current.row.id) + 1 : 0;

  return (
    <>
      <PageHeader
        size="lg"
        eyebrow="Upload · batch"
        title="New models"
        description="One ZIP per model: OBJ + MTL + textures. Titles autofill from filenames — edit before submitting. Each upload runs in 8 MB chunks, one row at a time."
        back={{ label: "← Model library", href: "/models" }}
        action={<ThemeToggle variant="compact" />}
      />

      {canUpload ? (
        <>
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,1fr))]">
            <div className="rounded-[11px] border border-line bg-panel px-[18px] py-4">
              <CoverageMeter
                label="Batch progress"
                detail={`${doneCount} of ${rows.length} done`}
                detailTone="accent"
                segments={mix}
              />
            </div>
            <StatTile label="Archives" size="lg" state={{ kind: "value", value: stats.archives }} hint={stats.total} />
            <StatTile
              label="Chunk size"
              size="lg"
              state={{ kind: "value", value: formatBytes(CHUNK_SIZE) }}
              hint="resumable on drops"
            />
            <StatTile
              label="Failed"
              size="lg"
              tone={stats.failed > 0 ? "bad" : "muted"}
              state={{ kind: "value", value: String(stats.failed) }}
              hint="batch continues"
            />
          </div>

          <div className="grid items-start gap-5 lg:grid-cols-[minmax(440px,1fr)_minmax(300px,360px)]">
            <div className="flex flex-col gap-4">
              <DropZone
                label="Drop ZIP archives here"
                hint="Or pick several at once — each becomes its own model."
                buttonLabel="Choose files"
                accept=".zip,application/zip"
                multiple
                onFiles={onFiles}
              />

              <div className="flex flex-col gap-2.5">
                <div className="flex items-center gap-3">
                  <SectionHeading
                    title="Queue"
                    count={`${stats.archives} archives · ${stats.total}`}
                    className="flex-1"
                  />
                  <Button variant="link" shape="pill" size="sm" onClick={onClearDone}>
                    clear done
                  </Button>
                </div>
                <div className="flex flex-col gap-[9px]">
                  {rows.map((row) => (
                    <QueueRowCard
                      key={row.id}
                      row={row}
                      onTitle={(title) => onTitle(row.id, title)}
                      onRemove={() => onRemove(row.id)}
                      onThumbnail={(file) => onThumbnail(row.id, file)}
                    />
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <Button variant="primary" loading={running} disabled={!running && !canSubmit} onClick={onRun}>
                  {running
                    ? current
                      ? `Uploading ${currentIndex} of ${rows.length}…`
                      : "Uploading…"
                    : `Upload ${rows.length} models`}
                </Button>
                {running ? (
                  <Button variant="secondary" onClick={onCancel}>
                    Cancel batch
                  </Button>
                ) : null}
                <span className="flex-1 basis-64 font-mono text-[10px] text-muted">
                  rows upload sequentially · titles lock once a row starts
                </span>
              </div>
            </div>

            <UploadAside current={current} checks={checks} failedNames={failedNames} />
          </div>
        </>
      ) : (
        <Callout tone="warn">Uploading models needs model:write.</Callout>
      )}
    </>
  );
}
