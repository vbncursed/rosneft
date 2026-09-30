import { useCallback, useState } from "react";

// Private windows and blocked site data throw on read; that reads as no entry.
const readRaw = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

/**
 * A choice remembered per browser under `key`. `stored` maps each choice to
 * the word kept for it; the one mapped to null is the default, kept as no
 * entry at all, and what an absent or unknown entry reads as. `stored` must be
 * a module-level constant: the setter depends on it.
 */
export function useStoredChoice<T extends string>(
  key: string,
  stored: Readonly<Record<T, string | null>>,
): [T, (next: T) => void] {
  const [choice, setChoice] = useState<T>(() => {
    const choices = Object.keys(stored) as T[];
    const fallback = choices.find((c) => stored[c] === null);
    if (fallback === undefined) throw new Error("useStoredChoice: no choice maps to null");
    const raw = readRaw(key);
    return choices.find((c) => stored[c] === raw) ?? fallback;
  });

  // The write stays out of the updater: React 19 StrictMode double-invokes
  // those, and a side effect in one runs twice.
  const set = useCallback(
    (next: T) => {
      try {
        const word = stored[next];
        if (word === null) localStorage.removeItem(key);
        else localStorage.setItem(key, word);
      } catch {
        // A remembered choice is a convenience, not something to fail over.
      }
      setChoice(next);
    },
    [key, stored],
  );

  return [choice, set];
}
