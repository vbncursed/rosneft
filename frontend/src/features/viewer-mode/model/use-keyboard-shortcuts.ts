import { useEffect, useRef } from "react";

type Handler = () => void;

// Keyed by event.key. Use the literal "Escape" / "Enter" for named keys
// or a single lowercase letter (e.g. "m") — character keys are matched
// case-insensitively, so the caller only needs one entry per letter.
type KeyboardShortcuts = Record<string, Handler>;

const TYPING_TAGS = new Set(["INPUT", "SELECT", "TEXTAREA"]);

// The Latin letter on a physical KeyX key, for a non-Latin layout (ЙЦУКЕН
// types "ь" on KeyM). Only consulted when event.key is not a Latin letter
// itself, so Dvorak and AZERTY keep the letter they print.
function physicalLetter(event: KeyboardEvent): string | undefined {
  if (/^[a-z]$/iu.test(event.key)) return undefined;
  return /^Key([A-Z])$/u.exec(event.code)?.[1].toLowerCase();
}

/**
 * A key the viewer must leave alone: typed into a field, pressed under an open
 * <dialog>, or held with ⌘/Ctrl/Alt — ⌘F is the browser's find, ⌘R a reload,
 * never the free cam or the rotate gizmo. FreeCamRig reads the same rule.
 */
export function isShortcutBlocked(event: KeyboardEvent): boolean {
  const target = event.target as HTMLElement | null;
  if (target && TYPING_TAGS.has(target.tagName)) return true;
  if (event.metaKey || event.ctrlKey || event.altKey) return true;
  return document.querySelector("dialog[open]") !== null;
}

// useKeyboardShortcuts binds a global keydown listener and dispatches to
// the shortcut whose key matches event.key. The handler map is read from
// a ref so callers can pass a fresh object each render without re-binding
// the listener. Targets that are typing controls are skipped so number
// entry doesn't fight the shortcuts.
//
// An open <dialog> takes every key, because it is on top: Esc cancelling a
// confirm dialog used to run the viewer's escape ladder underneath it as
// well, and walk the reader out of the panorama they were standing in.
// `Modal` and `ConfirmDialog` are both native dialogs; `ViewportWindow` is a
// <section role="dialog"> on purpose, so the PDF window keeps its keys.
export function useKeyboardShortcuts(shortcuts: KeyboardShortcuts): void {
  const latest = useRef(shortcuts);

  useEffect(() => {
    latest.current = shortcuts;
  });

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // A held key repeats its keydown; every shortcut here is a toggle or a
      // one-shot (G flips walk, a refused walk toasts), so one press is one act.
      if (event.repeat || isShortcutBlocked(event)) return;
      const map = latest.current;
      const letter = physicalLetter(event);
      const handler = map[event.key] ?? map[event.key.toLowerCase()] ?? (letter ? map[letter] : undefined);
      if (handler) handler();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
