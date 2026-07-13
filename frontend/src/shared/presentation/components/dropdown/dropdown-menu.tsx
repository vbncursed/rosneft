"use client";

import { type CSSProperties, type Ref } from "react";
import { createPortal } from "react-dom";
import { motion } from "motion/react";
import type { DropdownOption } from "@/shared/presentation/components/dropdown/dropdown-option";
import type { AnchorRect } from "@/shared/presentation/components/dropdown/use-anchored-position";
import { scaleFade } from "@/shared/presentation/motion/variants";
import { quick } from "@/shared/presentation/motion/transitions";
import { useResolvedVariants } from "@/shared/presentation/motion/reduced-motion";

interface DropdownMenuProps {
  id: string;
  listRef: Ref<HTMLUListElement>;
  rect: AnchorRect | null;
  value: string;
  options: DropdownOption[];
  highlightIndex: number;
  onHighlight: (index: number) => void;
  onCommit: (option: DropdownOption) => void;
}

const MENU_GAP = 6;

function menuStyle(rect: AnchorRect): CSSProperties {
  return {
    position: "fixed",
    top: rect.top + rect.height + MENU_GAP,
    left: rect.left,
    width: rect.width,
  };
}

// DropdownMenu renders the listbox via a portal to <body>. Portaling
// escapes any parent stacking context — `backdrop-blur` on sibling
// panels would otherwise clip the menu under them. Positioning is fixed
// to the trigger's viewport rect (re-measured on scroll/resize).
//
// Falls back to null until both the client mounts (document exists)
// and the trigger has been measured.
export default function DropdownMenu({
  id,
  listRef,
  rect,
  value,
  options,
  highlightIndex,
  onHighlight,
  onCommit,
}: DropdownMenuProps) {
  const anim = useResolvedVariants(scaleFade);
  // The wider viewer (ModelViewer) is loaded via next/dynamic with
  // ssr:false, so this component never renders on the server. Guard
  // anyway in case another caller mounts it during SSR — createPortal
  // touching document.body would otherwise crash the render.
  if (typeof document === "undefined" || !rect) return null;

  return createPortal(
    <motion.ul
      ref={listRef}
      role="listbox"
      id={id}
      tabIndex={-1}
      style={menuStyle(rect)}
      variants={anim}
      initial="hidden"
      animate="visible"
      exit="hidden"
      transition={quick}
      className="z-[1000] max-h-64 origin-top overflow-y-auto rounded-md border border-white/10 bg-neutral-900/95 py-1 text-xs shadow-[0_12px_30px_rgba(0,0,0,0.45)] backdrop-blur-md"
    >
      {options.map((option, i) => {
        if (option.header) {
          return (
            <li
              key={option.value}
              role="presentation"
              className="select-none px-2.5 pb-1 pt-2 text-[10px] uppercase tracking-[0.18em] text-neutral-500 first:pt-1"
            >
              {option.label}
            </li>
          );
        }
        const isSelected = option.value === value;
        const isHighlighted = i === highlightIndex;
        return (
          <li
            key={option.value}
            role="option"
            aria-selected={isSelected}
            aria-disabled={option.disabled ? true : undefined}
            data-index={i}
            onMouseEnter={() => !option.disabled && onHighlight(i)}
            onMouseDown={(e) => {
              // Prevent the trigger from losing focus before the
              // commit fires — onMouseDown beats onBlur/click order.
              e.preventDefault();
              if (!option.disabled) onCommit(option);
            }}
            className={`flex cursor-pointer items-center gap-2 px-2.5 py-1.5 transition-colors ${
              option.disabled
                ? "cursor-not-allowed text-neutral-500"
                : isHighlighted
                  ? "bg-white/10 text-white"
                  : "text-neutral-200"
            }`}
          >
            <span
              aria-hidden="true"
              className={`text-[10px] ${
                isSelected ? "text-cyan-300" : "text-neutral-600"
              }`}
            >
              {isSelected ? "●" : "○"}
            </span>
            <span className="min-w-0 flex-1 truncate">{option.label}</span>
            {option.hint ? (
              <span className="shrink-0 text-[10px] text-neutral-500">
                {option.hint}
              </span>
            ) : null}
          </li>
        );
      })}
    </motion.ul>,
    document.body,
  );
}
