import { StageList, type ConversionStage } from "@/entities/conversion";
import { Checklist } from "@/shared/ui/checklist";
import { PRESERVED } from "../model/replace-form";

export type ReplaceAsideProps = {
  stages: (ConversionStage & { hint: string })[];
};

/** The right column: what the re-convert pipeline will do, and what the swap leaves untouched. */
export function ReplaceAside({ stages }: ReplaceAsideProps) {
  return (
    <aside className="flex flex-col gap-4 lg:sticky lg:top-6">
      <div className="overflow-hidden rounded-[14px] border border-line bg-panel shadow-elevation">
        <div className="border-b border-line bg-panel-2 px-[18px] py-4">
          <p className="m-0 font-mono text-[9px] uppercase tracking-[0.2em] text-muted">
            After the upload
          </p>
          <p className="m-0 mt-2 text-[14px] font-semibold">Re-convert in place</p>
        </div>
        <div className="px-[18px] py-4">
          <StageList stages={stages} activeTone="accent" />
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-card border border-line bg-panel p-[18px]">
        <p className="m-0 font-mono text-[9px] uppercase tracking-[0.2em] text-muted">
          What is preserved
        </p>
        <Checklist items={PRESERVED} label="What is preserved" />
      </div>
    </aside>
  );
}
