"use client";

import { useEffect, useId, useState } from "react";
import { AnimatePresence, motion, useAnimationControls, useReducedMotion } from "motion/react";
import { scaleFade } from "@/shared/presentation/motion/variants";
import { quick } from "@/shared/presentation/motion/transitions";
import { useResolvedVariants } from "@/shared/presentation/motion/reduced-motion";

const inputCls =
  "block w-full rounded-xl border bg-black/40 px-4 py-3 pr-12 text-sm text-white outline-none transition-colors duration-200";

interface PasswordFieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  error?: string | null;
  autoComplete?: string;
  onGenerate?: () => void;
}

export default function PasswordField({
  label,
  value,
  onChange,
  required,
  error,
  autoComplete,
  onGenerate,
}: PasswordFieldProps) {
  const [show, setShow] = useState(false);
  const iconAnim = useResolvedVariants(scaleFade);
  const reduced = useReducedMotion();
  // Pulse the value blurry→crisp in place on each toggle (no remount, so the
  // field never blinks out). Reduced motion skips the pulse entirely.
  const reveal = useAnimationControls();
  useEffect(() => {
    if (reduced) return;
    reveal.set({ filter: "blur(5px)" });
    reveal.start({ filter: "blur(0px)", transition: { duration: 0.2, ease: "easeOut" } });
  }, [show, reduced, reveal]);
  const id = useId();
  const border = error
    ? "border-red-400/60 focus:border-red-400"
    : "border-white/10 focus:border-cyan-300/60";
  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <label htmlFor={id} className="block text-xs uppercase tracking-[0.2em] text-neutral-400">
          {label}
          {required ? " *" : ""}
        </label>
        {onGenerate ? (
          <button
            type="button"
            onClick={() => {
              onGenerate();
              setShow(true);
            }}
            className="cursor-pointer text-[10px] uppercase tracking-[0.2em] text-cyan-300/80 transition-colors hover:text-cyan-200"
          >
            Generate
          </button>
        ) : null}
      </div>
      <div className="relative mt-2">
        <motion.div animate={reveal}>
          <input
            id={id}
            type={show ? "text" : "password"}
            value={value}
            required={required}
            autoComplete={autoComplete}
            onChange={(e) => onChange(e.target.value)}
            className={`${inputCls} ${border}`}
          />
        </motion.div>
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? "Hide password" : "Show password"}
          aria-pressed={show}
          className="absolute inset-y-0 right-0 flex cursor-pointer items-center px-3 text-neutral-400 transition-colors hover:text-neutral-200"
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={show ? "off" : "on"}
              variants={iconAnim}
              initial="hidden"
              animate="visible"
              exit="hidden"
              transition={quick}
              className="flex"
            >
              {show ? <EyeOffIcon /> : <EyeIcon />}
            </motion.span>
          </AnimatePresence>
        </button>
      </div>
      {error ? <p className="mt-1 text-xs text-red-300">{error}</p> : null}
    </div>
  );
}

function EyeIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3l18 18" />
      <path d="M10.6 10.6a3 3 0 0 0 4.2 4.2" />
      <path d="M9.9 4.2A10.9 10.9 0 0 1 12 4c6.5 0 10 7 10 7a18.5 18.5 0 0 1-3.2 4.2M6.1 6.1A18.5 18.5 0 0 0 2 12s3.5 7 10 7a10.9 10.9 0 0 0 3.9-.7" />
    </svg>
  );
}
