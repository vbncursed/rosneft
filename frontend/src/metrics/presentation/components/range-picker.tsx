"use client";

import { RANGES, type Range } from "@/metrics/domain/panel";

const LABELS: Record<Range, string> = { "1h": "1 ч", "6h": "6 ч", "24h": "24 ч", "7d": "7 д" };

export default function RangePicker({
  value,
  onChange,
}: {
  value: Range;
  onChange: (r: Range) => void;
}) {
  return (
    <div
      className="flex gap-1 rounded-xl border border-white/10 bg-black/30 p-1"
      role="group"
      aria-label="Период"
    >
      {RANGES.map((r) => (
        <button
          key={r}
          type="button"
          onClick={() => onChange(r)}
          aria-pressed={r === value}
          className={`cursor-pointer rounded-lg px-3 py-1.5 text-xs transition-colors ${
            r === value
              ? "bg-white/10 text-white"
              : "text-neutral-400 hover:bg-white/5 hover:text-white"
          }`}
        >
          {LABELS[r]}
        </button>
      ))}
    </div>
  );
}
