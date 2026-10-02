import { useEffect, useRef, useState, type ReactNode } from "react";
import { clsx as cx } from "clsx";
import { Icon, type IconName } from "@/shared/ui/icon";
import { Tooltip } from "@/shared/ui/tooltip";

export type ToastTone = "error" | "warning" | "info" | "success" | "neutral" | "loading";

export type ToastProps = {
  tone: ToastTone;
  children: ReactNode;
  /** Overrides the tone's default overline. */
  label?: string;
  onDismiss?: () => void;
  /**
   * Overrides the dismiss button's accessible name. Two stacked toasts both
   * named "Dismiss" are indistinguishable to a screen reader. The tooltip
   * still says "Dismiss": a sighted reader has the card beside it.
   */
  dismissLabel?: string;
  /** A button beside the message; `name` keeps two stacked cards' buttons apart. */
  action?: { label: string; name?: string; onClick: () => void };
  /**
   * Milliseconds before the card dismisses itself; a thin bar along the bottom
   * counts it down and stops while the pointer or focus is on the card.
   * Defaults to 4000 for success, info and neutral; error, warning and
   * loading wait for the reader (`null`).
   */
  duration?: number | null;
  /** loading only: 0–100 draws a determinate bar under the message. */
  progress?: number;
  className?: string;
};

// The ground is the opaque panel, tone or not: a card over the viewer's chrome
// must not let the text beneath read through it (same ground as ModeChip). The
// tone shows in the border, the overline, the icon and the countdown bar.
const TONE: Record<ToastTone, { label: string; skin: string; icon: IconName | null; life: number | null }> = {
  error: {
    label: "Error",
    icon: "close",
    life: null,
    skin: "border-bad bg-panel text-bad",
  },
  warning: {
    label: "Warning",
    icon: "warning",
    life: null,
    skin: "border-warn bg-panel text-warn",
  },
  info: {
    label: "Info",
    icon: "info",
    life: 4000,
    skin: "border-accent-line bg-panel text-accent",
  },
  success: {
    label: "Success",
    icon: "check",
    life: 4000,
    skin: "border-ok bg-panel text-ok",
  },
  // No tint: a plain fact with nothing to celebrate or fix.
  neutral: { label: "Notice", icon: null, life: 4000, skin: "border-line-2 bg-panel text-muted" },
  // Work under way: the spinner is the icon; it stays until the caller replaces it.
  loading: { label: "Working", icon: null, life: null, skin: "border-line-2 bg-panel text-accent" },
};

const EXIT_MS = 150;

export function Toast({
  tone,
  children,
  label,
  onDismiss,
  dismissLabel = "Dismiss",
  action,
  duration,
  progress,
  className,
}: ToastProps) {
  const { label: fallback, skin, icon, life } = TONE[tone];
  const lifetime = duration === undefined ? life : duration;
  const timed = lifetime != null && lifetime > 0 && !!onDismiss;
  const [leaving, setLeaving] = useState(false);
  const [held, setHeld] = useState(false);
  const left = useRef(lifetime ?? 0);
  const started = useRef(0);
  const bar = useRef<HTMLSpanElement>(null);

  const leave = () => {
    if (leaving) return;
    setLeaving(true);
    setTimeout(() => onDismiss?.(), EXIT_MS);
  };

  // The countdown runs only while nothing holds it: hovering or focusing the
  // card pauses both the timer and the bar, which resumes from where it was.
  useEffect(() => {
    if (!timed || held || leaving) return;
    started.current = Date.now();
    const el = bar.current;
    if (el) {
      el.style.transition = "none";
      el.style.transform = `scaleX(${left.current / lifetime})`;
      void el.offsetWidth;
      el.style.transition = `transform ${left.current}ms linear`;
      el.style.transform = "scaleX(0)";
    }
    const t = setTimeout(leave, left.current);
    return () => {
      clearTimeout(t);
      left.current = Math.max(0, left.current - (Date.now() - started.current));
      if (el) {
        el.style.transition = "none";
        el.style.transform = `scaleX(${left.current / lifetime})`;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timed, held, leaving, lifetime]);

  return (
    <div
      // Errors and warnings interrupt; the other tones are announced by the
      // host's polite live region (a status inside it would nest regions).
      role={tone === "error" || tone === "warning" ? "alert" : undefined}
      aria-busy={tone === "loading" || undefined}
      onPointerEnter={() => setHeld(true)}
      onPointerLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={() => setHeld(false)}
      data-leaving={leaving || undefined}
      className={cx(
        "toast relative flex w-full items-start gap-2.5 overflow-hidden rounded-card border px-3.5 py-3 shadow-elevation",
        skin,
        className,
      )}
    >
      <span aria-hidden="true" className="mt-px flex size-4 shrink-0 items-center justify-center">
        {tone === "loading" ? (
          <span className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent [animation-duration:700ms] motion-reduce:[animation-duration:2s]" />
        ) : icon ? (
          <Icon name={icon} size={16} />
        ) : (
          <span className="size-1.5 rounded-full bg-current" />
        )}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="font-mono text-[10px] font-semibold uppercase leading-4 tracking-[0.18em]">
          {label ?? fallback}
        </span>
        <p className="m-0 text-[13px] leading-[1.45] text-fg">{children}</p>
        {tone === "loading" && progress !== undefined ? (
          <span
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress)}
            className="mt-1 block h-1 overflow-hidden rounded-full bg-line"
          >
            <span
              className="block h-full origin-left bg-accent transition-transform duration-300 ease-linear"
              style={{ transform: `scaleX(${Math.min(100, Math.max(0, progress)) / 100})` }}
            />
          </span>
        ) : null}
      </div>
      {action ? (
        <button
          type="button"
          onClick={action.onClick}
          aria-label={action.name}
          className="shrink-0 self-center cursor-pointer rounded-control-sm border border-current bg-transparent px-2 py-0.5 text-[12px] font-semibold transition-[color,background-color,border-color,scale] duration-150 ease-out hover:bg-panel active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {action.label}
        </button>
      ) : null}
      {onDismiss ? (
        <Tooltip label="Dismiss">
          <button
            type="button"
            onClick={leave}
            aria-label={dismissLabel}
            // A 24px target (WCAG 2.5.8) around the glyph; the negative margins
            // keep the row's height and the glyph where the padding put it.
            className="-my-0.5 -mr-1.5 flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-control-sm border-none bg-transparent text-muted transition-[color,scale] duration-150 ease-out hover:text-fg active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <Icon name="close" size={14} />
          </button>
        </Tooltip>
      ) : null}
      {timed ? (
        <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-0.5 bg-current/15">
          <span ref={bar} className="block h-full origin-left bg-current opacity-70" />
        </span>
      ) : null}
    </div>
  );
}

export type ToastStackItem = Omit<ToastProps, "onDismiss"> & { id: string | number };

export type ToastStackProps = {
  toasts: readonly ToastStackItem[];
  onDismiss: (id: ToastStackItem["id"]) => void;
  /** Cards drawn at once; the rest fold into a "+N more" line. Default 3. */
  max?: number;
  /**
   * `fixed` pins the stack to the viewport's top-right corner (the app);
   * `inline` lays it out in place (a preview, a panel).
   */
  position?: "fixed" | "inline";
  className?: string;
};

/**
 * The top-right column every notice lands in: newest on top, at most `max`
 * cards, the overflow counted on one line below them.
 */
export function ToastStack({ toasts, onDismiss, max = 3, position = "fixed", className }: ToastStackProps) {
  const shown = [...toasts].reverse().slice(0, max);
  const hidden = toasts.length - shown.length;
  return (
    <section
      aria-label="Notifications"
      aria-live="polite"
      className={cx(
        "flex w-[min(380px,calc(100vw-32px))] flex-col items-stretch gap-2",
        position === "fixed" && "fixed top-4 right-4 z-50",
        className,
      )}
    >
      {shown.map(({ id, ...t }) => (
        <Toast key={id} {...t} onDismiss={() => onDismiss(id)} />
      ))}
      {hidden > 0 ? (
        <p className="m-0 self-end rounded-full border border-line-2 bg-panel px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted shadow-elevation">
          +{hidden} more
        </p>
      ) : null}
    </section>
  );
}
