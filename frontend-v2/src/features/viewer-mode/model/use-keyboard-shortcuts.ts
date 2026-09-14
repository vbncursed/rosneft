import { useEffect, useRef } from "react";

type Handler = () => void;

// Keyed by event.key. Use the literal "Escape" / "Enter" for named keys
// or a single lowercase letter (e.g. "m") — character keys are matched
// case-insensitively, so the caller only needs one entry per letter.
type KeyboardShortcuts = Record<string, Handler>;

const TYPING_TAGS = new Set(["INPUT", "SELECT", "TEXTAREA"]);

// useKeyboardShortcuts binds a global keydown listener and dispatches to
// the shortcut whose key matches event.key. The handler map is read from
// a ref so callers can pass a fresh object each render without re-binding
// the listener. Targets that are typing controls are skipped so number
// entry doesn't fight the shortcuts.
export function useKeyboardShortcuts(shortcuts: KeyboardShortcuts): void {
  const latest = useRef(shortcuts);

  useEffect(() => {
    latest.current = shortcuts;
  });

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && TYPING_TAGS.has(target.tagName)) return;
      const map = latest.current;
      const handler = map[event.key] ?? map[event.key.toLowerCase()];
      if (handler) handler();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
