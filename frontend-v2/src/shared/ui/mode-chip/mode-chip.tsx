import { clsx as cx } from "clsx";
import type { ReactNode } from "react";
import { Icon, type IconName } from "@/shared/ui/icon";

export type ModeChipProps = {
  children: ReactNode;
  tone?: "accent" | "neutral";
  icon?: IconName;
  /** The loading chip: uppercase, wider tracking, the icon turning, aria-busy. */
  spinning?: boolean;
  kbd?: string;
  className?: string;
};

const TONE = {
  accent: "border-accent bg-accent-soft text-accent",
  neutral: "border-line-2 bg-panel text-muted",
} as const;

/** The line under the tool rail that says what the pointer does right now. */
export function ModeChip({ children, tone = "accent", icon, spinning = false, kbd, className }: ModeChipProps) {
  return (
    <span
      role="status"
      aria-busy={spinning || undefined}
      className={cx(
        "inline-flex items-center gap-2 rounded-[8px] border font-mono text-[10px] shadow-elevation",
        spinning ? "px-[11px] py-1.5 uppercase tracking-[0.16em]" : "px-[11px] py-[5px] tracking-[0.1em]",
        TONE[tone],
        className,
      )}
    >
      {icon ? (
        <Icon name={icon} size={12} className={spinning ? "animate-spin motion-reduce:animate-none" : undefined} />
      ) : null}
      {children}
      {kbd ? <kbd className="rounded-[4px] border border-accent-line px-[5px] py-px">{kbd}</kbd> : null}
    </span>
  );
}
