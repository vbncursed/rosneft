import { formatValue, labelFor, type DiffField, type Refs } from "@/entities/audit";

const name = (refs: Refs | undefined, field: string, value: unknown) =>
  (refs && labelFor(refs, field, value)) ?? formatValue(value);

/**
 * How the inspector writes one changed field on a single line:
 * "before → after" for a change, "+ value" for an addition, "− value" for a
 * removal. The sign is what carries the meaning when the tone is not visible.
 * An id the refs can name is printed as that name, on either side of the arrow.
 */
export function inspectorValue(field: DiffField, refs?: Refs): string {
  if (field.kind === "added") return `+ ${name(refs, field.field, field.after)}`;
  if (field.kind === "removed") return `− ${name(refs, field.field, field.before)}`;
  return `${name(refs, field.field, field.before)} → ${name(refs, field.field, field.after)}`;
}
