import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "@/shared/lib/cx";

const button = cva(
  "inline-flex cursor-pointer items-center justify-center gap-2 border transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-55",
  {
    variants: {
      variant: {
        primary: "border-accent bg-accent text-accent-fg hover:bg-accent/90",
        secondary: "border-line-2 bg-panel-2 text-fg hover:border-accent-line",
        ghost: "border-transparent bg-transparent text-fg hover:bg-panel-2",
        danger: "border-bad bg-bad-soft text-bad hover:bg-bad/20",
        accent: "border-accent-line bg-accent-soft text-accent hover:bg-accent/20",
        // "← Back to site": no chrome at all, only the mono label.
        link: "border-transparent bg-transparent text-muted hover:text-fg",
      },
      shape: {
        control: "font-sans",
        pill: "rounded-full font-mono uppercase tracking-[0.18em]",
        icon: "shrink-0 p-0 font-sans",
      },
      size: { sm: "", md: "", lg: "" },
    },
    compoundVariants: [
      { shape: "control", size: "sm", class: "rounded-control-sm px-3 py-1.5 text-xs font-semibold" },
      { shape: "control", size: "md", class: "rounded-control px-[18px] py-2.5 text-[13px] font-medium" },
      { shape: "control", size: "lg", class: "rounded-control-lg px-[26px] py-3.5 text-[15px] font-semibold" },
      { shape: "pill", size: "sm", class: "px-3.5 py-1.5 text-[10px]" },
      { shape: "pill", size: "md", class: "px-[18px] py-2.5 text-[11px]" },
      { shape: "pill", size: "lg", class: "px-6 py-3 text-xs" },
      { shape: "icon", size: "sm", class: "size-8 rounded-control text-[13px]" },
      { shape: "icon", size: "md", class: "size-9 rounded-control text-[15px]" },
      { shape: "icon", size: "lg", class: "size-11 rounded-control-lg text-base" },
      // The primary control reads as the emphasised action; medium is the one
      // place the design draws it at 600 rather than 500.
      { shape: "control", size: "md", variant: "primary", class: "font-semibold" },
      { shape: "control", size: "md", variant: "danger", class: "font-semibold" },
      { shape: "control", size: "md", variant: "accent", class: "font-semibold" },
      { shape: "pill", variant: "link", class: "px-0 tracking-[0.2em]" },
    ],
    defaultVariants: { variant: "secondary", shape: "control", size: "md" },
  },
);

type Variants = VariantProps<typeof button>;

type BaseProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> &
  Variants & {
    /** Swaps the label for a spinner and blocks further clicks. */
    loading?: boolean;
  };

export type ButtonProps =
  | (BaseProps & { shape?: "control" | "pill"; children: ReactNode })
  // An icon-only button carries no text, so it has to name itself.
  | (BaseProps & { shape: "icon"; children: ReactNode; "aria-label": string });

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
      className={cx(button({ variant, shape, size }), className)}
      {...rest}
    >
      {loading ? (
        <span
          data-testid="button-spinner"
          aria-hidden="true"
          className="size-[11px] animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none"
        />
      ) : null}
      {children}
    </button>
  );
}
