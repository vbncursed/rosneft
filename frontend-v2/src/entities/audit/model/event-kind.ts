/** The four shapes a journal entry takes, as the timeline draws them. */
export type EventKind = "create" | "update" | "delete" | "auth";

/**
 * Reads the kind out of an action slug. Every action the gateway emits ends in
 * create/update/delete, or sits under `auth.`; anything unrecognised is shown
 * as an update — the neutral "something changed", rather than claiming a
 * creation or a deletion that may not have happened.
 */
export function eventKind(action: string): EventKind {
  if (action.startsWith("auth.")) return "auth";
  const verb = action.split(".").pop();
  if (verb === "create" || verb === "delete") return verb;
  return "update";
}
