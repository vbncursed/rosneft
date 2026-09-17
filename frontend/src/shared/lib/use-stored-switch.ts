import { useCallback, useState } from "react";

// Absence means "on": a reader who has never touched the switch sees the
// thing it controls. Only the hidden choice is worth storing.
const storedHidden = (key: string): boolean => {
  try {
    return localStorage.getItem(key) === "hidden";
  } catch {
    // Private windows and blocked site data throw on read.
    return false;
  }
};

/**
 * A show/hide switch remembered per browser under `key` (`"hidden"`, or no
 * entry at all). Returns whether it is on and the toggle.
 */
export function useStoredSwitch(key: string): [boolean, () => void] {
  const [on, setOn] = useState(() => !storedHidden(key));

  // The write stays out of the updater: React 19 StrictMode double-invokes
  // those, and a side effect in one runs twice.
  const toggle = useCallback(() => {
    const next = !on;
    try {
      if (next) localStorage.removeItem(key);
      else localStorage.setItem(key, "hidden");
    } catch {
      // A remembered switch is a convenience, not something to fail over.
    }
    setOn(next);
  }, [key, on]);

  return [on, toggle];
}
