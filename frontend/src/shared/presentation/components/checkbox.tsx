"use client";

import { useId } from "react";
import { motion, useReducedMotion, type Transition } from "motion/react";

interface CheckboxProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  // Visible text next to the box. Omit for a bare box (pass ariaLabel then).
  label?: string;
  id?: string;
  ariaLabel?: string;
  className?: string;
}

// Checkbox is the app's styled replacement for a native checkbox: a real
// (sr-only) input keeps keyboard, focus, and label semantics, while a motion
// box paints the glass look and springs the tick in on check. Respects
// prefers-reduced-motion (everything collapses to instant).
export default function Checkbox({
  checked,
  onChange,
  disabled = false,
  label,
  id,
  ariaLabel,
  className,
}: CheckboxProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const reduced = useReducedMotion();
  const colorT: Transition = reduced ? { duration: 0 } : { duration: 0.15 };
  const pop: Transition = reduced ? { duration: 0 } : { type: "spring", stiffness: 600, damping: 22 };
  const draw: Transition = reduced ? { duration: 0 } : { duration: 0.2, ease: "easeOut" };

  return (
    <label
      htmlFor={inputId}
      className={`inline-flex items-center gap-2 ${
        disabled ? "cursor-not-allowed opacity-40" : "cursor-pointer"
      } ${className ?? ""}`}
    >
      <span className="relative inline-flex">
        <input
          id={inputId}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          aria-label={ariaLabel ?? label}
          onChange={(e) => onChange(e.target.checked)}
          className="peer sr-only"
        />
        <motion.span
          aria-hidden="true"
          initial={false}
          animate={{
            backgroundColor: checked ? "rgba(34,211,238,1)" : "rgba(255,255,255,0.03)",
            borderColor: checked ? "rgba(103,232,249,1)" : "rgba(255,255,255,0.25)",
          }}
          transition={colorT}
          whileTap={disabled ? undefined : { scale: 0.88 }}
          className="flex size-4 items-center justify-center rounded-[4px] border peer-focus-visible:ring-2 peer-focus-visible:ring-cyan-300/60 peer-focus-visible:ring-offset-0"
        >
          <motion.svg
            viewBox="0 0 16 16"
            className="size-3"
            fill="none"
            stroke="#0a0a0a"
            strokeWidth={2.6}
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={false}
            animate={{ scale: checked ? 1 : 0 }}
            transition={pop}
          >
            <motion.path
              d="M3.5 8.5l3 3 6-6.5"
              initial={false}
              animate={{ pathLength: checked ? 1 : 0 }}
              transition={draw}
            />
          </motion.svg>
        </motion.span>
      </span>
      {label ? (
        <span className="select-none text-[12px] text-neutral-100">{label}</span>
      ) : null}
    </label>
  );
}
