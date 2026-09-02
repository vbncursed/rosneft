import { formatValue, type DiffField } from "@/entities/audit";

/**
 * How the inspector writes one changed field on a single line:
 * "before → after" for a change, "+ value" for an addition, "− value" for a
 * removal. The sign is what carries the meaning when the tone is not visible.
 */
export function inspectorValue(field: DiffField): string {
  if (field.kind === "added") return `+ ${formatValue(field.after)}`;
  if (field.kind === "removed") return `− ${formatValue(field.before)}`;
  return `${formatValue(field.before)} → ${formatValue(field.after)}`;
}
