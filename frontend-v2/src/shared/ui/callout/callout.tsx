import { clsx as cx } from "clsx";
import type { ReactNode } from "react";
import { Icon, type IconName } from "@/shared/ui/icon";

export type CalloutTone = "bad" | "warn" | "ok" | "accent";

export type CalloutProps = {
  tone: CalloutTone;
  children: ReactNode;
  /** Defaults to the warning triangle; pass another glyph where it fits. */
  icon?: IconName;
  /** md the single-line inline notice; lg the start-aligned block, e.g. Replace Source's warning; note the conversion page's 10px-radius aside. */
  size?: "md" | "lg" | "note";
  /** A mono overline above the body — the failure box's "Worker message". */
  title?: string;
  /** Sets the body in the mono face, for text the server wrote. */
  mono?: boolean;
  className?: string;
};

const SKIN: Record<CalloutTone, string> = {
  bad: "border-bad bg-bad-soft text-bad",
  warn: "border-warn bg-warn-soft text-warn",
  ok: "border-ok bg-ok-soft text-ok",
  accent: "border-accent-line bg-accent-soft text-accent",
};

const SIZE: Record<NonNullable<CalloutProps["size"]>, string> = {
  md: "items-center gap-2 rounded-[9px] px-3 py-2.5",
  lg: "items-start gap-2.5 rounded-card px-4 py-3.5",
  note: "items-start gap-[9px] rounded-control-lg px-[13px] py-[11px]",
};

const GLYPH: Record<NonNullable<CalloutProps["size"]>, number> = { md: 15, lg: 15, note: 14 };

const MONO = "font-mono leading-[1.55] break-words select-text";

/** A single-line notice inside a panel — smaller than a toast, and inert. */
export function Callout({ tone, children, icon = "warning", size = "md", title, mono, className }: CalloutProps) {
  return (
    <div
      // A problem with the account in front of you is not an interruption to
      // announce; it is part of the panel being read. A callout that appears
      // after a keystroke is announced by the slot it lands in — the audit
      // notice slot is a persistent live region — not by a role added here,
      // which would only nest one region inside another.
      role={tone === "bad" ? "alert" : undefined}
      className={cx("flex border", SIZE[size], SKIN[tone], className)}
    >
      <Icon name={icon} size={GLYPH[size]} className="shrink-0" />
      {title ? (
        <div className="min-w-0 flex-1">
          <p className="m-0 font-mono text-[9px] uppercase tracking-[0.2em]">{title}</p>
          <p className={cx("mt-[7px] mb-0 text-xs", mono && MONO)}>{children}</p>
        </div>
      ) : (
        <p className={cx("m-0 text-xs", mono && MONO)}>{children}</p>
      )}
    </div>
  );
}
