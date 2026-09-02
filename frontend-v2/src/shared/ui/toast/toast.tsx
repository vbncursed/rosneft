import type { ReactNode } from "react";
import { clsx as cx } from "clsx";

export type ToastTone = "error" | "warning" | "info" | "success";

export type ToastProps = {
  tone: ToastTone;
  children: ReactNode;
  /** Overrides the tone's default overline. */
  label?: string;
  onDismiss?: () => void;
  className?: string;
};

const TONE: Record<ToastTone, { label: string; skin: string }> = {
  error: { label: "Error", skin: "border-bad bg-bad-soft text-bad" },
  warning: { label: "Warning", skin: "border-warn bg-warn-soft text-warn" },
  info: { label: "Info", skin: "border-accent-line bg-accent-soft text-accent" },
  success: { label: "Success", skin: "border-ok bg-ok-soft text-ok" },
};

export function Toast({ tone, children, label, onDismiss, className }: ToastProps) {
  const { label: fallback, skin } = TONE[tone];

  return (
    <div
      // Errors and warnings interrupt; the other two wait their turn.
      role={tone === "error" || tone === "warning" ? "alert" : "status"}
      className={cx(
        "flex items-start gap-2.5 rounded-[10px] border px-3.5 py-3",
        skin,
        className,
      )}
    >
      <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em]">
        {label ?? fallback}
      </span>
      <p className="m-0 flex-1 text-[13px] leading-[1.45] text-fg">{children}</p>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="cursor-pointer border-none bg-transparent p-0 text-muted transition-colors duration-150 hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          ×
        </button>
      ) : null}
    </div>
  );
}
