export type DiffKind = "added" | "removed" | "changed";

export type DiffField = {
  field: string;
  before: unknown;
  after: unknown;
  kind: DiffKind;
};

// Timestamps move on every write; showing them would bury the change the reader
// came for. The journal already drops entries where nothing but these moved, so
// anything reaching here has a real change alongside them.
const IGNORED = new Set(["created_at", "updated_at"]);

type Row = Record<string, unknown> | null;

/**
 * Compares two row snapshots from the journal.
 *
 * Values are compared structurally, not by reference: placement transforms
 * arrive as nested objects and a reference check would mark every one of them
 * changed. A missing key and a null value stay distinct — a column being gone
 * is not the same as a column being empty.
 */
export function diffRows(before: Row, after: Row): DiffField[] {
  const fields = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])].sort();
  const out: DiffField[] = [];

  for (const field of fields) {
    if (IGNORED.has(field)) continue;
    const hadBefore = before !== null && field in before;
    const hasAfter = after !== null && field in after;

    if (!hadBefore) {
      out.push({ field, before: undefined, after: after?.[field], kind: "added" });
      continue;
    }
    if (!hasAfter) {
      out.push({ field, before: before[field], after: undefined, kind: "removed" });
      continue;
    }
    const b = before[field];
    const a = after[field];
    if (JSON.stringify(b) === JSON.stringify(a)) continue;
    out.push({ field, before: b, after: a, kind: "changed" });
  }
  return out;
}

/** How a journal value is written out — quoted strings, JSON for structures. */
export function formatValue(value: unknown): string {
  if (value === undefined) return "—";
  if (typeof value === "string") return `"${value}"`;
  return JSON.stringify(value) ?? String(value);
}
