import { useId, useRef, type ClipboardEvent, type KeyboardEvent } from "react";
import { clsx as cx } from "clsx";
import { clearDigitAt, isComplete, sanitize, setDigitAt } from "./otp";

export type OtpInputProps = {
  value: string;
  onChange: (value: string) => void;
  length?: number;
  disabled?: boolean;
  /** Names the whole group; each cell announces its own position. */
  label?: string;
  className?: string;
  autoFocus?: boolean;
  /** lg is the login screen's full-width row of taller cells. */
  size?: "md" | "lg";
};

export function OtpInput({
  value,
  onChange,
  length = 6,
  disabled = false,
  label = "One-time code",
  className,
  autoFocus = false,
  size = "md",
}: OtpInputProps) {
  const groupId = useId();
  const cells = useRef<(HTMLInputElement | null)[]>([]);
  const complete = isComplete(value, length);

  const focusCell = (index: number) => {
    if (index >= 0 && index < length) cells.current[index]?.focus();
  };

  const handleInput = (index: number, raw: string) => {
    const digit = sanitize(raw, 1);
    if (!digit) return;
    onChange(setDigitAt(value, index, digit, length));
    focusCell(index + 1);
  };

  const handleKeyDown = (index: number, event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Backspace") {
      event.preventDefault();
      // A filled cell clears in place; an empty one steps back and clears there,
      // which is what makes held-backspace walk the whole code out.
      if (value[index] && value[index] !== " ") {
        onChange(clearDigitAt(value, index, length));
      } else {
        onChange(clearDigitAt(value, index - 1, length));
        focusCell(index - 1);
      }
      return;
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      focusCell(index - 1);
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      focusCell(index + 1);
    }
  };

  const handlePaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const pasted = sanitize(event.clipboardData.getData("text"), length);
    if (!pasted) return;
    event.preventDefault();
    onChange(pasted);
    focusCell(Math.min(pasted.length, length - 1));
  };

  return (
    <div
      role="group"
      aria-label={label}
      aria-describedby={groupId}
      className={cx("flex gap-2", disabled && "opacity-45", className)}
    >
      {Array.from({ length }, (_, index) => {
        const digit = value[index] ?? "";
        return (
          <input
            key={index}
            ref={(el) => {
              cells.current[index] = el;
            }}
            value={digit === " " ? "" : digit}
            onChange={(e) => handleInput(index, e.target.value)}
            onKeyDown={(e) => handleKeyDown(index, e)}
            onPaste={handlePaste}
            onFocus={(e) => e.target.select()}
            disabled={disabled}
            autoFocus={autoFocus && index === 0}
            inputMode="numeric"
            autoComplete={index === 0 ? "one-time-code" : "off"}
            maxLength={1}
            aria-label={`Digit ${index + 1} of ${length}`}
            className={cx(
              "rounded-control border bg-panel-2 text-center font-mono text-fg outline-none transition-colors duration-150",
              size === "lg" ? "h-14 flex-1 text-xl" : "h-12 w-10 text-lg",
              "focus:border-accent focus:ring-[3px] focus:ring-accent-soft",
              "disabled:border-line disabled:text-dim",
              complete ? "border-accent bg-accent-soft" : "border-line-2",
            )}
          />
        );
      })}
    </div>
  );
}
