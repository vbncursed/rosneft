import { clsx as cx } from "clsx";
import type { ReactNode } from "react";
import { Icon, type IconName } from "@/shared/ui/icon";

export type CalloutTone = "bad" | "warn" | "ok" | "accent";

export type CalloutProps = {
  tone: CalloutTone;
  children: ReactNode;
  /** Defaults to the warning triangle; pass another glyph where it fits. */
  icon?: IconName;
  className?: string;
};

const SKIN: Record<CalloutTone, string> = {
  bad: "border-bad bg-bad-soft text-bad",
  warn: "border-warn bg-warn-soft text-warn",
  ok: "border-ok bg-ok-soft text-ok",
  accent: "border-accent-line bg-accent-soft text-accent",
};

/** A single-line notice inside a panel — smaller than a toast, and inert. */
export function Callout({ tone, children, icon = "warning", className }: CalloutProps) {
  return (
    <div
      // A problem with the account in front of you is not an interruption to
      // announce; it is part of the panel being read.
      role={tone === "bad" ? "alert" : undefined}
      className={cx(
        "flex items-center gap-2 rounded-[9px] border px-3 py-2.5",
        SKIN[tone],
        className,
      )}
    >
      <Icon name={icon} size={15} className="shrink-0" />
      <p className="m-0 text-xs">{children}</p>
    </div>
  );
}
