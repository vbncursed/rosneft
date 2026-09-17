import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentPropsWithRef, ReactNode } from "react";
import { clsx as cx } from "clsx";

// Tailwind v4's `scale-*` writes the `scale` property, not `transform`, so the
// transition list names `scale`. The press depth lives on `size` (one property,
// one place): 0.97 for a control, 0.95 for the 24px icon, where 3% is invisible.
const button = cva(
  "relative inline-flex cursor-pointer items-center justify-center border transition-[color,background-color,border-color,scale] duration-150 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed",
  {
    variants: {
      variant: {
        primary: "border-accent bg-accent text-accent-fg hover:bg-accent/90",
        secondary: "border-line-2 text-fg hover:border-accent-line",
        ghost: "border-transparent bg-transparent text-fg hover:bg-panel-2",
        danger: "border-bad bg-bad-soft text-bad hover:bg-bad/20",
        accent: "border-accent-line bg-accent-soft text-accent hover:bg-accent/20",
        success: "border-ok bg-ok-soft text-ok hover:bg-ok/20",
        warning: "border-warn bg-transparent text-warn hover:bg-warn/10",
        // "← Back to site": no chrome at all, only the mono label.
        link: "border-transparent bg-transparent text-muted hover:text-fg",
      },
      shape: {
        control: "font-sans",
        pill: "rounded-full font-mono uppercase",
        icon: "shrink-0 p-0 font-sans",
      },
      size: {
        xs: "enabled:active:scale-95",
        sm: "enabled:active:scale-[0.97]",
        md: "enabled:active:scale-[0.97]",
        lg: "enabled:active:scale-[0.97]",
      },
    },
    compoundVariants: [
      { shape: "control", size: "sm", class: "rounded-control-sm px-3 py-1.5 text-xs font-semibold" },
      { shape: "control", size: "md", class: "rounded-control px-[18px] py-2.5 text-[13px] font-medium" },
      { shape: "control", size: "lg", class: "rounded-control-lg px-[26px] py-3.5 text-[15px] font-semibold" },
      // Tracking lives here, per size, not on the base pill string: a base
      // utility and a compound one both setting letter-spacing collide, and
      // the winner is the compiled stylesheet's own source order, not the
      // className string's — the same trap the ground-colour comment below
      // already names. One property, one variant group.
      { shape: "pill", size: "sm", class: "px-3.5 py-1.5 text-[10px] tracking-[0.14em]" },
      { shape: "pill", size: "md", class: "px-[18px] py-2.5 text-[11px] tracking-[0.18em]" },
      { shape: "pill", size: "lg", class: "px-6 py-3 text-xs tracking-[0.18em]" },
      // xs exists for the icon shape alone: the viewer's 24px glyph buttons.
      { shape: "icon", size: "xs", class: "size-6 rounded-[6px] text-xs" },
      { shape: "icon", size: "sm", class: "size-8 rounded-control text-[13px]" },
      { shape: "icon", size: "md", class: "size-9 rounded-control text-[15px]" },
      { shape: "icon", size: "lg", class: "size-11 rounded-control-lg text-base" },
      // The primary control reads as the emphasised action; medium is the one
      // place the design draws it at 600 rather than 500.
      { shape: "control", size: "md", variant: "primary", class: "font-semibold" },
      { shape: "control", size: "md", variant: "danger", class: "font-semibold" },
      { shape: "control", size: "md", variant: "accent", class: "font-semibold" },
      { shape: "pill", variant: "link", class: "px-0 tracking-[0.2em]" },
      // A pill sits on a panel and shows it through; the control and icon
      // shapes take the raised panel-2 ground. The ground is set per shape
      // rather than on `variant` with a compound overriding it: two background
      // utilities on one element are resolved by the compiled stylesheet's own
      // source order, not by the className string's, so the override only
      // looked right by accident. One property, one variant group.
      { shape: "control", variant: "secondary", class: "bg-panel-2" },
      { shape: "icon", variant: "secondary", class: "bg-panel-2" },
      { shape: "pill", variant: "secondary", class: "bg-transparent hover:bg-panel-2" },
    ],
    defaultVariants: { variant: "secondary", shape: "control", size: "md" },
  },
);

type Variants = VariantProps<typeof button>;

// ComponentPropsWithRef, not ButtonHTMLAttributes: React 19 takes `ref` as a
// plain prop, and the props type has to admit it or `{...rest}` never carries
// it to the element. The guided tour focuses its own Next button through it.
type BaseProps = Omit<ComponentPropsWithRef<"button">, "children"> &
  Omit<Variants, "shape" | "size"> & {
    /** Covers the label with a spinner, keeping the width, and blocks further clicks. */
    loading?: boolean;
  };

export type ButtonProps =
  | (BaseProps & { shape?: "control" | "pill"; size?: "sm" | "md" | "lg"; children: ReactNode })
  // An icon-only button carries no text, so it has to name itself.
  | (BaseProps & { shape: "icon"; size?: "xs" | "sm" | "md" | "lg"; children: ReactNode; "aria-label": string });

export function Button({
  variant,
  shape,
  size,
  loading = false,
  disabled,
  className,
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      // Only a disabled button dims; a loading one is busy, not unavailable.
      className={cx(button({ variant, shape, size }), disabled && !loading && "opacity-55", className)}
      {...rest}
    >
      {loading ? (
        <span aria-hidden="true" className="absolute inset-0 grid place-items-center">
          <span
            data-testid="button-spinner"
            className="size-[11px] animate-spin rounded-full border-2 border-current border-t-transparent [animation-duration:700ms] motion-reduce:[animation-duration:2s]"
          />
        </span>
      ) : null}
      {/* The label stays in the flow while hidden, so the button keeps its width;
          the blur blends the swap into one change instead of two overlapping. */}
      <span
        className={cx(
          "inline-flex items-center justify-center gap-2 transition-[opacity,filter] duration-150 ease-out",
          loading && "opacity-0 blur-[2px]",
        )}
      >
        {children}
      </span>
    </button>
  );
}
