/** "<field>:<value>" → human name, as GET /api/audit's `refs` sends them. */
export type Refs = Record<string, string>;

/**
 * The name behind an id inside a row snapshot, or null when nobody could name
 * it — a structure is never an id, and an absent key falls back to the id.
 */
export function labelFor(refs: Refs, field: string, value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  return refs[`${field}:${String(value)}`] ?? null;
}

/** The first eight characters of a long id — enough to tell two apart. */
export const shortId = (value: string | number): string => {
  const s = String(value);
  return s.length > 12 ? s.slice(0, 8) : s;
};
