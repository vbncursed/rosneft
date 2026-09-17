import { useEffect, type RefObject } from "react";
import { useEscape } from "./use-escape";

/**
 * Closes a popup on Escape or on a pointer landing outside it.
 * Shared by Dropdown, Menu and DatePicker so all three dismiss alike.
 */
export function useDismiss(
  ref: RefObject<HTMLElement | null>,
  open: boolean,
  onDismiss: () => void,
) {
  useEscape(open, onDismiss);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) onDismiss();
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [ref, open, onDismiss]);
}
