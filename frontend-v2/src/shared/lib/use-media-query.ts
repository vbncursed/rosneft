import { useCallback, useSyncExternalStore } from "react";

/**
 * Whether a CSS media query matches right now, and a re-render when that
 * changes.
 *
 * `useSyncExternalStore` rather than an effect with a state: the browser
 * already owns this value, so there is nothing to mirror — the first render
 * reads the real answer instead of painting the wrong one and correcting it a
 * frame later. That matters here because the value picks *labels*
 * ("Translate (T)" against "Translate T"), and a swap after paint is a visible
 * flicker on every load under the breakpoint.
 *
 * Where `matchMedia` does not exist — a non-browser render, an environment
 * that blocks it — the answer is false: the wide layout is the default the
 * design is drawn at.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = globalThis.matchMedia?.(query);
      if (!list) return () => {};
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query],
  );

  const snapshot = useCallback(() => globalThis.matchMedia?.(query).matches ?? false, [query]);

  return useSyncExternalStore(subscribe, snapshot, () => false);
}
