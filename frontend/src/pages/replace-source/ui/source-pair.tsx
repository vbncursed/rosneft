import type { Territory } from "@/entities/territory";
import { DetailList, type Detail } from "@/shared/ui/detail-list";
import { currentRows, newRows, shortHash } from "../model/replace-form";

export type SourcePairProps = {
  territory: Territory;
  currentSize: number | null;
  file: File | null;
};

/** The delta row rendered with the mock's accent colour; the pure `newRows` stays plain-string testable. */
function accented(items: Detail[]): Detail[] {
  return items.map((item) =>
    item.label === "delta" ? { ...item, value: <span className="text-accent">{item.value}</span> } : item,
  );
}

/** The current archive against the one about to replace it, side by side. */
export function SourcePair({ territory, currentSize, file }: SourcePairProps) {
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] items-stretch gap-3">
      <div className="flex flex-col gap-[11px] rounded-card border border-line bg-panel p-[16px_18px]">
        <p className="m-0 font-mono text-[9px] uppercase tracking-[0.2em] text-muted">Current source</p>
        <p className="m-0 text-[14px] font-semibold">{shortHash(territory.sourceBlobHash)}</p>
        <DetailList items={currentRows(territory, currentSize)} />
      </div>

      {file ? (
        <div className="flex flex-col gap-[11px] rounded-card border border-accent bg-accent-soft p-[16px_18px]">
          <p className="m-0 font-mono text-[9px] uppercase tracking-[0.2em] text-accent">New source</p>
          <p className="m-0 text-[14px] font-semibold">{file.name}</p>
          <DetailList items={accented(newRows(file, currentSize))} />
        </div>
      ) : (
        <div className="flex flex-col gap-[11px] rounded-card border border-dashed border-line-2 bg-panel p-[16px_18px]">
          <p className="m-0 font-mono text-[9px] uppercase tracking-[0.2em] text-muted">New source</p>
          <p className="m-0 text-xs text-muted">No file chosen yet.</p>
        </div>
      )}
    </div>
  );
}
