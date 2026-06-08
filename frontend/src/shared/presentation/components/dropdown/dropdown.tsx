"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { DropdownOption } from "@/shared/presentation/components/dropdown/dropdown-option";
import { useDropdownKeyboard } from "@/shared/presentation/components/dropdown/use-dropdown-keyboard";
import { useAnchoredPosition } from "@/shared/presentation/components/dropdown/use-anchored-position";
import DropdownMenu from "@/shared/presentation/components/dropdown/dropdown-menu";

export interface DropdownProps {
  value: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
  // Optional uppercase prefix rendered inside the trigger ("VIEW · 3D scene").
  // When omitted only the selected label shows.
  label?: string;
  // ARIA-only label for the button. Use when there's no visible label
  // (e.g. trigger inside a tight toolbar). Falls back to `label` if both
  // are absent.
  ariaLabel?: string;
  disabled?: boolean;
  placeholder?: string;
  // Optional explicit width on the trigger. Defaults to fit-content
  // sized by the selected label; pass "w-full" to fill the parent.
  className?: string;
}

// Dropdown is the custom replacement for native <select>. Visual style
// matches the rest of the viewer — neutral-900/95 glass with white/10
// borders and cyan-300 accents on the active row. Single-select, listbox
// pattern (button[aria-haspopup=listbox] → ul[role=listbox]).
//
// The open menu is portaled to <body> so sibling panels with their own
// stacking contexts (anything with `backdrop-blur`, `transform`, or
// `opacity < 1`) can't trap it underneath. Position is fixed and
// re-measured on scroll/resize via useAnchoredPosition.
export default function Dropdown({
  value,
  options,
  onChange,
  label,
  ariaLabel,
  disabled = false,
  placeholder = "Select…",
  className = "",
}: DropdownProps) {
  const [open, setOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(() =>
    Math.max(
      0,
      options.findIndex((o) => o.value === value && !o.disabled),
    ),
  );
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();
  const rect = useAnchoredPosition(triggerRef, open);

  const selected = useMemo(
    () => options.find((o) => o.value === value) ?? null,
    [options, value],
  );

  // Resets highlight to the selected option (or the first enabled one)
  // so keyboard navigation starts from the user's last choice each time
  // the menu opens.
  const openMenu = useCallback(() => {
    const idx = options.findIndex((o) => o.value === value && !o.disabled);
    setHighlightIndex(idx === -1 ? options.findIndex((o) => !o.disabled) : idx);
    setOpen(true);
  }, [options, value]);

  const closeMenu = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  const toggleMenu = useCallback(() => {
    if (open) setOpen(false);
    else openMenu();
  }, [open, openMenu]);

  // Outside-click + Esc-from-anywhere close. Listening on mousedown
  // (not click) lets the dropdown close before any other click target
  // fires — important for buttons that immediately re-open something.
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      const t = event.target as Node;
      if (triggerRef.current?.contains(t)) return;
      if (listRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onEsc = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  // Scroll the highlighted row into view inside the portaled listbox.
  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLLIElement>(
      `[data-index="${highlightIndex}"]`,
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [open, highlightIndex]);

  const handleCommit = useCallback(
    (option: DropdownOption) => {
      onChange(option.value);
      setOpen(false);
      triggerRef.current?.focus();
    },
    [onChange],
  );

  const onKeyDown = useDropdownKeyboard({
    open,
    options,
    highlightIndex,
    setHighlightIndex,
    onOpen: openMenu,
    onClose: closeMenu,
    onCommit: handleCommit,
  });

  const displayLabel = selected?.label ?? placeholder;

  return (
    <div className={`relative inline-block ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => !disabled && toggleMenu()}
        onKeyDown={onKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={ariaLabel ?? label ?? "Select option"}
        className="group flex w-full cursor-pointer items-center justify-between gap-2 rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-xs text-neutral-100 transition-colors hover:bg-white/10 focus:border-cyan-300/40 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      >
        {label ? (
          <span className="shrink-0 text-[10px] uppercase tracking-[0.18em] text-neutral-400">
            {label}
          </span>
        ) : null}
        <span className="min-w-0 flex-1 truncate text-left">{displayLabel}</span>
        <span
          aria-hidden="true"
          className={`shrink-0 text-neutral-400 transition-transform duration-150 ${
            open ? "rotate-180 text-cyan-300/80" : ""
          }`}
        >
          ▾
        </span>
      </button>

      {open ? (
        <DropdownMenu
          id={listId}
          listRef={listRef}
          rect={rect}
          value={value}
          options={options}
          highlightIndex={highlightIndex}
          onHighlight={setHighlightIndex}
          onCommit={handleCommit}
        />
      ) : null}
    </div>
  );
}
