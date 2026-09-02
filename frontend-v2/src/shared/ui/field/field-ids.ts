import type { ReactNode } from "react";

export const hintId = (id: string) => `${id}-hint`;
export const errorId = (id: string) => `${id}-error`;

/** The describedby a control should advertise for the hint/error it was given. */
export function describedBy(id: string, hint?: ReactNode, error?: ReactNode) {
  if (error) return errorId(id);
  if (hint) return hintId(id);
  return undefined;
}
