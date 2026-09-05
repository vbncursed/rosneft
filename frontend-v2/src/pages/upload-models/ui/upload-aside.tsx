import { StageList } from "@/entities/conversion";
import { formatBytes } from "@/shared/lib/format-bytes";
import { Callout } from "@/shared/ui/callout";
import { Checklist, type ChecklistItem } from "@/shared/ui/checklist";
import { currentRowStages, type CurrentStats, type QueueRow } from "../model/batch";

export type UploadAsideProps = {
  current?: { row: QueueRow; stats: CurrentStats };
  checks: ChecklistItem[];
  failedNames: string[];
};

/** The right column: the row actively uploading, the pre-flight checklist, and any failures. */
export function UploadAside({ current, checks, failedNames }: UploadAsideProps) {
  return (
    <aside className="flex flex-col gap-4 lg:sticky lg:top-6">
      {current ? (
        <div className="overflow-hidden rounded-[14px] border border-accent-line bg-panel shadow-elevation">
          <div className="border-b border-line bg-accent-soft px-[18px] py-4">
            <p className="m-0 font-mono text-[9px] uppercase tracking-[0.2em] text-accent">Current row</p>
            <p className="m-0 mt-1 text-[15px] font-semibold">{current.row.title}</p>
            <p className="m-0 mt-1 font-mono text-[11px] text-muted">
              {current.row.file.name} · {formatBytes(current.row.file.size)}
            </p>
          </div>
          <div className="flex flex-col gap-4 px-[18px] py-4">
            <StageList stages={currentRowStages(current.row)} activeTone="accent" />
            <dl className="m-0 grid grid-cols-2 gap-x-3 gap-y-1.5 font-mono text-[11px]">
              <dt className="m-0 text-dim">chunk</dt>
              <dd className="m-0 text-right">{current.stats.chunk}</dd>
              <dt className="m-0 text-dim">speed</dt>
              <dd className="m-0 text-right">{current.stats.speed}</dd>
              {current.stats.thumbnail ? (
                <>
                  <dt className="m-0 text-dim">thumbnail</dt>
                  <dd className="m-0 text-right text-ok">{current.stats.thumbnail}</dd>
                </>
              ) : null}
            </dl>
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-3 rounded-card border border-line bg-panel p-[18px]">
        <p className="m-0 font-mono text-[10px] uppercase tracking-[0.2em] text-muted">
          Before you submit
        </p>
        <Checklist items={checks} label="Before you submit" />
      </div>

      {failedNames.map((name) => (
        <Callout key={name} tone="bad">
          {name} failed — a failed row doesn't stop the rest of the batch. Fix the archive and re-add it.
        </Callout>
      ))}
    </aside>
  );
}
