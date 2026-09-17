import { clsx as cx } from "clsx";
import type { ReactNode } from "react";
import { Icon, type IconName } from "@/shared/ui/icon";

export type ModeChipProps = {
  children: ReactNode;
  tone?: "accent" | "neutral";
  icon?: IconName;
  /** The loading chip: uppercase, wider tracking, the icon turning, aria-busy. */
  spinning?: boolean;
  /**
   * The accessible name, and what makes the chip a live region: named, it is a
   * `role="status"` the reader can tell apart; unnamed it is plain text, which
   * is what a second chip beside a named one should be.
   */
  label?: string;
  kbd?: string;
  className?: string;
};

// The accent chip is drawn over a panorama photograph, so its 14% tint sits on
// an opaque panel ground. The tint is a background *image*: a colour and an
// image are two properties, and an inset shadow would collide with the
// elevation shadow every chip already carries.
const TONE = {
  accent: "border-accent bg-panel bg-[image:linear-gradient(var(--accent-soft),var(--accent-soft))] text-accent",
  neutral: "border-line-2 bg-panel text-muted",
} as const;

/** The line under the tool rail that says what the pointer does right now. */
export function ModeChip({ children, tone = "accent", icon, spinning = false, label, kbd, className }: ModeChipProps) {
  return (
    <span
      role={label ? "status" : undefined}
      aria-label={label}
      aria-busy={spinning || undefined}
      className={cx(
        "inline-flex items-center gap-2 rounded-[8px] border font-mono text-[10px] shadow-elevation",
        spinning ? "px-[11px] py-1.5 uppercase tracking-[0.16em]" : "px-[11px] py-[5px] tracking-[0.1em]",
        TONE[tone],
        className,
      )}
    >
      {icon ? (
        <Icon name={icon} size={12} className={spinning ? "animate-spin [animation-duration:700ms] motion-reduce:[animation-duration:2s]" : undefined} />
      ) : null}
      {children}
      {kbd ? <kbd className="rounded-[4px] border border-accent-line px-[5px] py-px">{kbd}</kbd> : null}
    </span>
  );
}
