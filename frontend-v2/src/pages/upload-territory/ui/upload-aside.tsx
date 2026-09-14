import type { ConversionStage } from "@/entities/conversion";
import { StageList } from "@/entities/conversion";
import { Callout } from "@/shared/ui/callout";
import { Checklist, type ChecklistItem } from "@/shared/ui/checklist";

export type UploadAsideProps = {
  stages: (ConversionStage & { hint: string })[];
  checks: ChecklistItem[];
};

/** The right column: what the pipeline will do, the archive checklist, and the "it keeps running" note. */
export function UploadAside({ stages, checks }: UploadAsideProps) {
  return (
    <aside className="flex flex-col gap-4 lg:sticky lg:top-6">
      <div className="overflow-hidden rounded-[14px] border border-line bg-panel shadow-elevation">
        <div className="border-b border-line bg-panel-2 px-[18px] py-4">
          <p className="m-0 font-mono text-[9px] uppercase tracking-[0.2em] text-muted">
            What happens next
          </p>
          <p className="m-0 mt-1 text-[14px] font-semibold">Upload → convert → viewer</p>
        </div>
        <div className="px-[18px] py-4">
          <StageList stages={stages} activeTone="accent" />
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-card border border-line bg-panel p-[18px]">
        <p className="m-0 font-mono text-[10px] uppercase tracking-[0.2em] text-muted">
          Archive checklist
        </p>
        <Checklist items={checks} label="Archive checklist" />
      </div>

      <Callout tone="warn" icon="info">
        Conversion of a 2 GB territory takes ~3 minutes. You can close this tab — the job keeps
        running.
      </Callout>
    </aside>
  );
}
