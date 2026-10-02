import { clsx as cx } from "clsx";
import type { ReactNode } from "react";
import { Icon, type IconName } from "@/shared/ui/icon";
import { Tooltip } from "@/shared/ui/tooltip";

export type CalloutTone = "bad" | "warn" | "ok" | "accent" | "neutral" | "loading";

export type CalloutProps = {
  tone: CalloutTone;
  children: ReactNode;
  /**
   * Defaults to the tone's own glyph — bad `close`, warn `warning`, ok `check`,
   * accent and neutral `info`; loading draws a spinner and ignores it.
   */
  icon?: IconName;
  /** md the single-line inline notice; lg the start-aligned block, e.g. Replace Source's warning; note the conversion page's 10px-radius aside. */
  size?: "md" | "lg" | "note";
  /** A mono overline above the body — the failure box's "Worker message". */
  title?: string;
  /** Sets the body in the mono face, for text the server wrote. */
  mono?: boolean;
  /** Draws a close button; the caller removes the callout (and may remember that it did). */
  onDismiss?: () => void;
  /** The close button's accessible name; make it say what goes away when several are on screen. */
  dismissLabel?: string;
  className?: string;
};

const SKIN: Record<CalloutTone, string> = {
  bad: "border-bad bg-bad-soft text-bad",
  warn: "border-warn bg-warn-soft text-warn",
  ok: "border-ok bg-ok-soft text-ok",
  accent: "border-accent-line bg-accent-soft text-accent",
  // A plain aside: no state to report, so no tint — the raised ground and a hairline.
  neutral: "border-line-2 bg-panel-2 text-muted",
  // Work under way inside the panel; the spinner carries the accent, the text stays readable.
  loading: "border-accent-line bg-panel-2 text-fg",
};

const TONE_ICON: Record<Exclude<CalloutTone, "loading">, IconName> = {
  bad: "close",
  warn: "warning",
  ok: "check",
  accent: "info",
  neutral: "info",
};

const SIZE: Record<NonNullable<CalloutProps["size"]>, string> = {
  md: "items-center gap-2 rounded-[9px] px-3 py-2.5",
  lg: "items-start gap-2.5 rounded-card px-4 py-3.5",
  note: "items-start gap-[9px] rounded-control-lg px-[13px] py-[11px]",
};

const GLYPH: Record<NonNullable<CalloutProps["size"]>, number> = { md: 15, lg: 15, note: 14 };

const MONO = "font-mono leading-[1.55] break-words select-text";

// The note's body sits at 18px over 12px text in the mock; text-xs alone gives
// 16. `leading-*` writes --tw-leading, which text-xs's line-height reads, so
// the two compose rather than collide. MONO already sets line-height, so the
// two never reach one element — one property, one place.
const LEADING: Partial<Record<NonNullable<CalloutProps["size"]>, string>> = { note: "leading-[1.5]" };
const body = (size: NonNullable<CalloutProps["size"]>, mono?: boolean) => (mono ? MONO : LEADING[size]);

/** A single-line notice inside a panel — smaller than a toast, and inert. */
export function Callout({
  tone,
  children,
  icon,
  size = "md",
  title,
  mono,
  onDismiss,
  dismissLabel = "Dismiss",
  className,
}: CalloutProps) {
  return (
    <div
      // A problem with the account in front of you is not an interruption to
      // announce; it is part of the panel being read. A callout that appears
      // after a keystroke is announced by the slot it lands in — the audit
      // notice slot is a persistent live region — not by a role added here,
      // which would only nest one region inside another.
      role={tone === "bad" ? "alert" : undefined}
      aria-busy={tone === "loading" || undefined}
      className={cx("flex border", SIZE[size], SKIN[tone], className)}
    >
      {tone === "loading" ? (
        <span
          aria-hidden="true"
          className="flex shrink-0 items-center justify-center text-accent"
          style={{ width: GLYPH[size], height: GLYPH[size] }}
        >
          <span className="size-[11px] animate-spin rounded-full border-2 border-current border-t-transparent [animation-duration:700ms] motion-reduce:[animation-duration:2s]" />
        </span>
      ) : (
        <Icon name={icon ?? TONE_ICON[tone]} size={GLYPH[size]} className="shrink-0" />
      )}
      {title ? (
        <div className="min-w-0 flex-1">
          <p className="m-0 font-mono text-[9px] uppercase tracking-[0.2em]">{title}</p>
          <p className={cx("mt-[7px] mb-0 text-xs", body(size, mono))}>{children}</p>
        </div>
      ) : (
        <p className={cx("m-0 min-w-0 flex-1 text-xs", body(size, mono))}>{children}</p>
      )}
      {onDismiss ? (
        <Tooltip label="Dismiss">
          <button
            type="button"
            onClick={onDismiss}
            aria-label={dismissLabel}
            // A 24px target (WCAG 2.5.8) around the glyph; the negative margins
            // keep the callout's height where its padding put it.
            className="-my-1 -mr-1.5 flex size-6 shrink-0 cursor-pointer items-center justify-center self-start rounded-control-sm border-none bg-transparent text-current opacity-70 transition-[opacity,scale] duration-150 ease-out hover:opacity-100 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <Icon name="close" size={13} />
          </button>
        </Tooltip>
      ) : null}
    </div>
  );
}
