"use client";

import { useRef, type ClipboardEvent, type KeyboardEvent } from "react";

// OtpInput is a segmented numeric code field: one cell per digit, with
// auto-advance, backspace-to-previous, arrow navigation, and paste-to-fill.
// Controlled by `value` (the digits typed so far).
export default function OtpInput({
  value,
  onChange,
  onComplete,
  length = 6,
  disabled = false,
  autoFocus = false,
}: {
  value: string;
  onChange: (v: string) => void;
  onComplete?: (v: string) => void;
  length?: number;
  disabled?: boolean;
  autoFocus?: boolean;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const cells = Array.from({ length }, (_, i) => value[i] ?? "");

  const focus = (i: number) => refs.current[Math.min(Math.max(i, 0), length - 1)]?.focus();

  const setChar = (i: number, char: string) => {
    const next = cells.slice();
    next[i] = char;
    const v = next.join("").slice(0, length);
    onChange(v);
    if (char && v.length === length) onComplete?.(v);
  };

  const handleChange = (i: number, raw: string) => {
    const digits = raw.replace(/\D/g, "");
    if (!digits) return;
    setChar(i, digits[digits.length - 1]); // last digit typed lands in this cell
    focus(i + 1);
  };

  const handleKeyDown = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      e.preventDefault();
      if (cells[i]) setChar(i, "");
      else if (i > 0) {
        setChar(i - 1, "");
        focus(i - 1);
      }
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      focus(i - 1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      focus(i + 1);
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const digits = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
    if (!digits) return;
    onChange(digits);
    if (digits.length === length) onComplete?.(digits);
    focus(digits.length);
  };

  return (
    <div className="flex justify-center gap-2" role="group" aria-label="Verification code">
      {cells.map((c, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          value={c}
          disabled={disabled}
          autoFocus={autoFocus && i === 0}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
          onFocus={(e) => e.currentTarget.select()}
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          maxLength={1}
          aria-label={`Digit ${i + 1}`}
          className="h-14 w-11 rounded-xl border border-white/10 bg-black/40 text-center font-[family-name:var(--font-geist-mono)] text-xl tabular-nums text-white outline-none transition-colors focus:border-cyan-300/60 disabled:opacity-40"
        />
      ))}
    </div>
  );
}
