import { clsx as cx } from "clsx";
import { diffRows, formatValue, type DiffKind } from "../model/diff";

const FIELD_TONE: Record<DiffKind, string> = {
  added: "text-ok",
  removed: "text-bad",
  changed: "text-accent",
};

export type DiffViewProps = {
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
};

/** The field-level change list under an expanded journal row. */
export function DiffView({ before, after }: DiffViewProps) {
  const fields = diffRows(before, after);

  if (fields.length === 0) {
    return <p className="m-0 text-[11px] text-dim">No field-level changes recorded.</p>;
  }

  return (
    <dl className="m-0 flex flex-col gap-[7px]">
      {fields.map((field) => (
        <div key={field.field} className="grid grid-cols-[150px_1fr] gap-3">
          <dt className={cx("font-mono text-[11px]", FIELD_TONE[field.kind])}>{field.field}</dt>
          <dd className="m-0 font-mono text-[11px]">
            {field.kind === "changed" ? (
              <>
                <span className="text-dim line-through">{formatValue(field.before)}</span>{" "}
                <span aria-hidden="true" className="text-dim">
                  →
                </span>{" "}
                <span className="text-fg">{formatValue(field.after)}</span>
              </>
            ) : field.kind === "added" ? (
              <span className="text-ok">{formatValue(field.after)}</span>
            ) : (
              <span className="text-bad line-through">{formatValue(field.before)}</span>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
