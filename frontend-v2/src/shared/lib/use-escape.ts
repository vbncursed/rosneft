import { useEffect } from "react";

/**
 * Listens on the document rather than the popup, so Escape works whether or not
 * focus has landed inside it yet.
 */
export function useEscape(active: boolean, onEscape: () => void) {
  useEffect(() => {
    if (!active) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onEscape();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [active, onEscape]);
}
