import { useCallback, useEffect, useRef, useState, type FocusEvent, type PointerEvent } from "react";

export const OPEN_DELAY = 500;
export const WARM_WINDOW = 300;

// One clock for every tooltip on the page: the pointer that just left one
// tooltip's trigger is reading along a row, so the next one opens at once.
let lastClosedAt = Number.NEGATIVE_INFINITY;

/** Tests start cold: the clock is module state and would leak between them. */
export function resetTooltipWarmup() {
  lastClosedAt = Number.NEGATIVE_INFINITY;
}

type State = { open: boolean; instant: boolean };

// A focus the browser would not ring — a click's, or a dialog placing focus on
// its first button — is not a keyboard user asking what the control is.
function isFocusVisible(el: Element) {
  try {
    return el.matches(":focus-visible");
  } catch {
    return true;
  }
}

/**
 * Open/close for one tooltip. `instant` means "no enter animation": a warm
 * hover and a keyboard focus both open without one — nothing keyboard-initiated
 * animates here, and a sweep along a row should not flicker.
 */
export function useTooltip() {
  const [state, setState] = useState<State>({ open: false, instant: false });
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pressed = useRef(false);
  // The element the tooltip names: whatever took the hover or the focus — the
  // child itself, or the wrapper around a disabled one.
  const anchor = useRef<Element | null>(null);

  // Written with the state, not read from it: React runs updaters at render,
  // and the pointer can leave one trigger and enter the next before that.
  const isOpen = useRef(false);

  const show = useCallback((instant: boolean) => {
    isOpen.current = true;
    setState({ open: true, instant });
  }, []);

  const close = useCallback(() => {
    clearTimeout(timer.current);
    if (isOpen.current) lastClosedAt = Date.now();
    isOpen.current = false;
    setState({ open: false, instant: false });
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);

  useEffect(() => {
    if (!state.open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // Capture on window runs before any modal's own Esc handler: this Esc
      // belongs to the tooltip, the next one to whatever sits underneath.
      // preventDefault too: a native <dialog> closes on Esc as a default action.
      event.stopPropagation();
      event.preventDefault();
      close();
    };
    window.addEventListener("keydown", onKey, true);
    // A fixed tooltip measured once cannot follow its trigger, so any scroll —
    // a panel's too, hence capture — or resize closes it. Armed a frame late:
    // a focus that scrolls its control into view fires that scroll next frame.
    const moved = { capture: true, passive: true } as const;
    const arm = requestAnimationFrame(() => {
      window.addEventListener("scroll", close, moved);
      window.addEventListener("resize", close);
    });
    return () => {
      window.removeEventListener("keydown", onKey, true);
      cancelAnimationFrame(arm);
      window.removeEventListener("scroll", close, moved);
      window.removeEventListener("resize", close);
    };
  }, [state.open, close]);

  const triggerProps = {
    onPointerEnter(event: PointerEvent) {
      if (event.pointerType !== "mouse") return;
      anchor.current = event.currentTarget;
      clearTimeout(timer.current);
      if (Date.now() - lastClosedAt < WARM_WINDOW) {
        show(true);
        return;
      }
      timer.current = setTimeout(() => show(false), OPEN_DELAY);
    },
    onPointerLeave() {
      pressed.current = false;
      close();
    },
    onPointerDown() {
      pressed.current = true;
      close();
    },
    onFocus(event: FocusEvent) {
      if (pressed.current || !isFocusVisible(event.target)) return;
      anchor.current = event.currentTarget;
      show(true);
    },
    onBlur() {
      pressed.current = false;
      close();
    },
  };

  return { ...state, anchor, triggerProps };
}
