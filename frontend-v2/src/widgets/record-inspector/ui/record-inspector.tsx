import { clsx as cx } from "clsx";
import { actorName, diffRows, type AuditEntry, type DiffKind } from "@/entities/audit";
import { Button } from "@/shared/ui/button";
import { inspectorValue } from "../model/inspector-value";

export type RecordInspectorProps = {
  entry: AuditEntry;
  /** Content hash of the journal row, if the server sent one. */
  digest?: string;
  onCopyJson: () => void;
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
  digest,
  onCopyJson,
  onOpenEntity,
}: RecordInspectorProps) {
  const fields = diffRows(entry.oldRow, entry.newRow);
  const failed = entry.result === "failed";

  return (
    <aside
      aria-label="Record inspector"
      className="overflow-hidden rounded-[14px] border border-accent-line bg-panel shadow-elevation"
    >
      <div className="border-b border-line bg-accent-soft px-4.5 py-4">
        <p className="m-0 font-mono text-[9px] uppercase tracking-[0.2em] text-accent">
          Record inspector
        </p>
        <p className="m-0 mt-2 font-mono text-sm text-fg">{entry.action}</p>
        <p className="m-0 mt-1 text-[13px] text-muted">{entry.entityLabel}</p>
      </div>

      <div className="flex flex-col gap-4 px-4.5 py-4">
        <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3.5 gap-y-2 font-mono text-[11px]">
          <dt className="text-dim">actor</dt>
          <dd className="m-0 text-fg">{actorName(entry)}</dd>

          <dt className="text-dim">result</dt>
          <dd className={cx("m-0", failed ? "text-bad" : "text-ok")}>{entry.result}</dd>

          {digest ? (
            <>
              <dt className="text-dim">digest</dt>
              <dd className="m-0 break-all text-muted">{digest}</dd>
            </>
          ) : null}
        </dl>

        {fields.length === 0 ? (
          <p className="m-0 text-[11px] text-dim">No field-level changes recorded.</p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {fields.map((field) => (
              <div
                key={field.field}
                className={cx("border-l-2 pl-2.5", TONE[field.kind].border)}
              >
                <p className={cx("m-0 font-mono text-[11px]", TONE[field.kind].text)}>
                  {field.field}
                </p>
                <p className="m-0 mt-[3px] break-all font-mono text-[11px] leading-[1.5] text-fg">
                  {inspectorValue(field)}
                </p>
              </div>
            ))}
          </div>
        )}

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
