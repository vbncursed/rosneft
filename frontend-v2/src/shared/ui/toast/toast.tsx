import type { ReactNode } from "react";
import { clsx as cx } from "clsx";

export type ToastTone = "error" | "warning" | "info" | "success";

export type ToastProps = {
  tone: ToastTone;
  children: ReactNode;
  /** Overrides the tone's default overline. */
  label?: string;
  onDismiss?: () => void;
  /**
   * Overrides the dismiss button's accessible name. Two stacked toasts both
   * named "Dismiss" are indistinguishable to a screen reader.
   */
  dismissLabel?: string;
  className?: string;
};

const TONE: Record<ToastTone, { label: string; skin: string }> = {
  error: { label: "Error", skin: "border-bad bg-bad-soft text-bad" },
  warning: { label: "Warning", skin: "border-warn bg-warn-soft text-warn" },
  info: { label: "Info", skin: "border-accent-line bg-accent-soft text-accent" },
  success: { label: "Success", skin: "border-ok bg-ok-soft text-ok" },
};

export function Toast({
  tone,
  children,
  label,
  onDismiss,
  dismissLabel = "Dismiss",
  className,
}: ToastProps) {
  const { label: fallback, skin } = TONE[tone];

  return (
    <div
      // Errors and warnings interrupt; the other two are announced by the
      // host's polite live region (a status inside it would nest regions).
      role={tone === "error" || tone === "warning" ? "alert" : undefined}
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
          aria-label={dismissLabel}
          // A 24px target (WCAG 2.5.8) around the glyph; the negative margins
          // keep the row's height and the glyph where the padding put it.
          className="-my-0.5 -mr-1.5 flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-[6px] border-none bg-transparent text-muted transition-[color,scale] duration-150 ease-out hover:text-fg active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          ×
        </button>
      ) : null}
    </div>
  );
}
