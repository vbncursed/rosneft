import { type KeyboardEvent, useCallback } from "react";
import type { DropdownOption } from "@/shared/presentation/components/dropdown/dropdown-option";

interface UseDropdownKeyboardParams {
  open: boolean;
  options: DropdownOption[];
  highlightIndex: number;
  setHighlightIndex: (index: number) => void;
  onOpen: () => void;
  onClose: () => void;
  onCommit: (option: DropdownOption) => void;
}

// nextEnabled walks the options array in the given direction (+1 / -1)
// starting from `from`, skipping disabled rows. Wraps at both ends so
// ↓ from the last item lands on the first enabled one. Returns -1 when
// every option is disabled.
function nextEnabled(
  options: DropdownOption[],
  from: number,
  direction: 1 | -1,
): number {
  if (options.length === 0) return -1;
  const len = options.length;
  for (let step = 1; step <= len; step += 1) {
    const idx = (from + direction * step + len * len) % len;
    if (!options[idx].disabled) return idx;
  }
  return -1;
}

function firstEnabled(options: DropdownOption[]): number {
  return options.findIndex((o) => !o.disabled);
}

function lastEnabled(options: DropdownOption[]): number {
  for (let i = options.length - 1; i >= 0; i -= 1) {
    if (!options[i].disabled) return i;
  }
  return -1;
}

// useDropdownKeyboard returns one handler for the trigger button. The
// closed/open state changes what each key does — closed Enter/Space/↓/↑
// opens; open ↑↓ moves highlight; Enter/Space commits the highlight;
// Esc closes; Home/End jump.
export function useDropdownKeyboard(params: UseDropdownKeyboardParams) {
  const {
    open,
    options,
    highlightIndex,
    setHighlightIndex,
    onOpen,
    onClose,
    onCommit,
  } = params;

  return useCallback(
    (event: KeyboardEvent<HTMLButtonElement>) => {
      const key = event.key;
      if (!open) {
        if (key === "Enter" || key === " " || key === "ArrowDown" || key === "ArrowUp") {
          event.preventDefault();
          onOpen();
        }
        return;
      }
      if (key === "Escape" || key === "Tab") {
        if (key === "Escape") event.preventDefault();
        onClose();
        return;
      }
      if (key === "ArrowDown") {
        event.preventDefault();
        const next = nextEnabled(options, highlightIndex, 1);
        if (next !== -1) setHighlightIndex(next);
        return;
      }
      if (key === "ArrowUp") {
        event.preventDefault();
        const next = nextEnabled(options, highlightIndex, -1);
        if (next !== -1) setHighlightIndex(next);
        return;
      }
      if (key === "Home") {
        event.preventDefault();
        const first = firstEnabled(options);
        if (first !== -1) setHighlightIndex(first);
        return;
      }
      if (key === "End") {
        event.preventDefault();
        const last = lastEnabled(options);
        if (last !== -1) setHighlightIndex(last);
        return;
      }
      if (key === "Enter" || key === " ") {
        event.preventDefault();
        const target = options[highlightIndex];
        if (target && !target.disabled) onCommit(target);
      }
    },
    [open, options, highlightIndex, setHighlightIndex, onOpen, onClose, onCommit],
  );
}
