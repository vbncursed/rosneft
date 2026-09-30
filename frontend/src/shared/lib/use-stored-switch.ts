import { useCallback } from "react";
import { useStoredChoice } from "./use-stored-choice";

// Absence means "on": a reader who has never touched the switch sees the
// thing it controls. Only the hidden choice is worth storing.
const STORED = { shown: null, hidden: "hidden" } as const;

/**
 * A show/hide switch remembered per browser under `key` (`"hidden"`, or no
 * entry at all). Returns whether it is on and the toggle.
 */
export function useStoredSwitch(key: string): [boolean, () => void] {
  const [choice, set] = useStoredChoice(key, STORED);
  const on = choice === "shown";
  const toggle = useCallback(() => set(on ? "hidden" : "shown"), [set, on]);
  return [on, toggle];
}
