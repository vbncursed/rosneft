import type { ReactNode } from "react";
import { clsx as cx } from "clsx";
import { errorId, hintId } from "./field-ids";

export type FieldProps = {
  /** Must match the control's own id — this is what ties the label to it. */
  id: string;
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
};

/** Wraps a control with the design's overline label and its hint/error line. */
export function Field({
  id,
  label,
  hint,
  error,
  required,
  disabled,
  className,
  children,
}: FieldProps) {
  return (
    <div className={cx("flex flex-col", className)}>
      {label ? (
        <label
          htmlFor={id}
          className={cx(
            "font-mono text-[10px] uppercase tracking-[0.18em]",
            disabled ? "text-dim" : "text-muted",
          )}
        >
          {label}
          {required ? <span aria-hidden="true"> *</span> : null}
        </label>
      ) : null}

      {children}

      {error ? (
        <p id={errorId(id)} role="alert" className="mt-1.5 text-[11px] text-bad">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId(id)} className="mt-1.5 text-[11px] text-dim">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

