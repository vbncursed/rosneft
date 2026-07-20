"use client";

import { motion, useReducedMotion } from "motion/react";
import { spring } from "@/shared/presentation/motion";
import { RANGES, type Range } from "@/metrics/domain/panel";

const LABELS: Record<Range, string> = { "1h": "1h", "6h": "6h", "24h": "24h", "7d": "7d" };

export default function RangePicker({
  value,
  onChange,
}: {
  value: Range;
  onChange: (r: Range) => void;
}) {
  const reduced = useReducedMotion();
  const indicatorTransition = reduced ? { duration: 0 } : spring;

  return (
    <div
      className="flex gap-1 rounded-xl border border-white/10 bg-black/30 p-1"
      role="group"
      aria-label="Time range"
    >
      {RANGES.map((r) => {
        const active = r === value;
        return (
          <button
            key={r}
            type="button"
            onClick={() => onChange(r)}
            aria-pressed={active}
            className={`relative cursor-pointer rounded-lg px-3 py-1.5 text-xs transition-colors ${
              active ? "text-white" : "text-neutral-400 hover:text-neutral-200"
            }`}
          >
            {/* Подложка одна на всю плашку: общий layoutId заставляет Motion
                переносить её между сегментами, а не гасить и зажигать заново. */}
            {active ? (
              <motion.span
                layoutId="metrics-range-indicator"
                transition={indicatorTransition}
                className="absolute inset-0 rounded-lg bg-white/10"
              />
            ) : null}
            <span className="relative z-10">{LABELS[r]}</span>
          </button>
        );
      })}
    </div>
  );
}
