import { clsx as cx } from "clsx";
import { diffRows, type AuditEntry, type DiffKind, type Refs } from "@/entities/audit";
import { Button } from "@/shared/ui/button";
import { DetailList, type Detail } from "@/shared/ui/detail-list";
import { inspectorValue } from "../model/inspector-value";

export type RecordInspectorProps = {
  entry: AuditEntry;
  /** Names for the ids inside the snapshots, merged from every loaded page. */
  refs?: Refs;
  /** Short hash shown in the overline, e.g. "4f21c8". */
  recordId?: string;
  /** actor / at / company / territory / result — composed by the route. */
  details?: Detail[];
  onCopyJson: () => void;
  /** Absent when the panel is not dismissable — a fixture, or a detail route. */
  onClose?: () => void;
  /** Absent when the entity is gone — a deleted record has nowhere to open. */
  onOpenEntity?: () => void;
};

const TONE: Record<DiffKind, { border: string; text: string }> = {
  added: { border: "border-l-ok", text: "text-ok" },
  removed: { border: "border-l-bad", text: "text-bad" },
  changed: { border: "border-l-accent", text: "text-accent" },
};

export function RecordInspector({
  entry,
  refs,
  recordId,
  details = [],
  onCopyJson,
  onClose,
  onOpenEntity,
}: RecordInspectorProps) {
  const fields = diffRows(entry.oldRow, entry.newRow);

  return (
    <aside
      aria-label="Record inspector"
      className="overflow-hidden rounded-[14px] border border-accent-line bg-panel shadow-elevation"
    >
      <div className="flex items-start justify-between gap-3 border-b border-line bg-accent-soft px-4.5 py-4">
        <div className="min-w-0">
          <p className="m-0 font-mono text-[9px] uppercase tracking-[0.2em] text-accent">
            {recordId ? `Record · ${recordId}` : "Record inspector"}
          </p>
          <p className="m-0 mt-2 font-mono text-sm text-fg">{entry.action}</p>
          <p className="m-0 mt-1 text-[13px] text-muted">{entry.entityLabel}</p>
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="cursor-pointer border-none bg-transparent p-0 leading-none text-muted transition-colors duration-150 hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            ×
          </button>
        ) : null}
      </div>

      <div className="flex flex-col gap-4 px-4.5 py-4">
        <DetailList items={details} />

        <div>
          <p className="m-0 mb-2.5 font-mono text-[9px] uppercase tracking-[0.2em] text-muted">
            Changed fields · {fields.length}
          </p>

          {fields.length === 0 ? (
            <p className="m-0 text-[11px] text-dim">No field-level changes recorded.</p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {fields.map((field) => (
                <div key={field.field} className={cx("border-l-2 pl-2.5", TONE[field.kind].border)}>
                  <p className={cx("m-0 font-mono text-[11px]", TONE[field.kind].text)}>
                    {field.field}
                  </p>
                  <p className="m-0 mt-[3px] break-all font-mono text-[11px] leading-[1.5] text-fg">
                    {inspectorValue(field, refs)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex gap-2 border-t border-line pt-3.5">
          <Button size="sm" className="flex-1 justify-center" onClick={onCopyJson}>
            Copy JSON
          </Button>
          {onOpenEntity ? (
            <Button size="sm" variant="accent" className="flex-1 justify-center" onClick={onOpenEntity}>
              Open entity
            </Button>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
