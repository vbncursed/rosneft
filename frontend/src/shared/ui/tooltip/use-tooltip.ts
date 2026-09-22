import { useCallback, useEffect, useRef, useState, type FocusEvent, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent } from "react";

export const OPEN_DELAY = 500;
export const WARM_WINDOW = 300;

// One clock for every tooltip on the page: the pointer that just left one
// tooltip's trigger is reading along a row, so the next one opens at once.
let lastClosedAt = Number.NEGATIVE_INFINITY;

/** Tests start cold: the clock is module state and would leak between them. */
export function resetTooltipWarmup() {
  lastClosedAt = Number.NEGATIVE_INFINITY;
  lastKey = "";
}

type State = { open: boolean; instant: boolean };

// The last key pressed anywhere, "" after a pointer press. A browser rings
// `:focus-visible` on *any* focus after a key — a Menu handing focus back on
// Esc, a dialog returning it to its opener on Enter — so only a focus that
// follows Tab (Shift+Tab is still key "Tab") is a keyboard user arriving.
let lastKey = "";
let listening = false;

function listenForKeys() {
  if (listening || typeof document === "undefined") return;
  listening = true;
  const opts = { capture: true, passive: true } as const;
  document.addEventListener("keydown", (event) => (lastKey = event.key), opts);
  document.addEventListener("pointerdown", () => (lastKey = ""), opts);
}

function isTabFocus(el: Element) {
  if (lastKey !== "Tab") return false;
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
  // A hover-opened tooltip is incidental to whatever the page does with Esc; a
  // focus-opened one is what the keyboard user is reading, so it takes the Esc.
  const byFocus = useRef(false);

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

  useEffect(() => {
    listenForKeys();
    return () => clearTimeout(timer.current);
  }, []);

  useEffect(() => {
    if (!state.open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      close();
      if (!byFocus.current) return;
      // Capture on window runs before any modal's own Esc handler: this Esc
      // belongs to the tooltip, the next one to whatever sits underneath.
      // preventDefault too: a native <dialog> closes on Esc as a default action.
      event.stopPropagation();
      event.preventDefault();
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
      byFocus.current = false;
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
    // Activating the control from the keyboard is the same as pressing it.
    onKeyDown(event: ReactKeyboardEvent) {
      if (event.key === "Enter" || event.key === " ") close();
    },
    onFocus(event: FocusEvent) {
      if (pressed.current || !isTabFocus(event.target)) return;
      byFocus.current = true;
      show(true);
    },
    onBlur() {
      pressed.current = false;
      close();
    },
  };

  return { ...state, triggerProps };
}
