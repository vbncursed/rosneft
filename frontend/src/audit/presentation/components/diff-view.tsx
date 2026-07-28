"use client";

import { diffRows, type DiffField } from "@/audit/domain/diff";

// Snapshots hold raw column values; anything non-scalar is rendered as JSON so
// a nested transform stays readable instead of collapsing to [object Object].
function render(value: unknown): string {
  if (value === undefined) return "—";
  if (value === null) return "null";
  if (typeof value === "string") return value === "" ? '""' : value;
  return JSON.stringify(value);
}

const KIND_STYLE: Record<DiffField["kind"], string> = {
  added: "text-emerald-300",
  removed: "text-rose-300",
  changed: "text-cyan-200",
};

export default function DiffView({
  oldRow,
  newRow,
}: {
  oldRow: Record<string, unknown> | null;
  newRow: Record<string, unknown> | null;
}) {
  const fields = diffRows(oldRow, newRow);

  if (fields.length === 0) {
    return <p className="text-xs text-neutral-500">No field-level changes recorded.</p>;
  }

  return (
    <dl className="grid gap-1.5">
      {fields.map((f) => (
        <div key={f.field} className="grid gap-1 sm:grid-cols-[minmax(0,10rem)_1fr] sm:gap-3">
          <dt className={`font-mono text-xs ${KIND_STYLE[f.kind]}`}>{f.field}</dt>
          <dd className="min-w-0 font-mono text-xs text-neutral-300">
            {f.kind === "added" ? (
              <span className="break-all text-emerald-200">{render(f.after)}</span>
            ) : f.kind === "removed" ? (
              <span className="break-all text-rose-200 line-through">{render(f.before)}</span>
            ) : (
              <span className="break-all">
                <span className="text-neutral-500 line-through">{render(f.before)}</span>
                <span className="mx-1.5 text-neutral-600">→</span>
                <span className="text-white">{render(f.after)}</span>
              </span>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
