import type { VariantProps } from "class-variance-authority";
import type { ComponentPropsWithRef, ReactNode } from "react";
import { clsx as cx } from "clsx";
import { Tooltip } from "@/shared/ui/tooltip";
import { buttonClass } from "./button-class";

type Variants = VariantProps<typeof buttonClass>;

// ComponentPropsWithRef, not ButtonHTMLAttributes: React 19 takes `ref` as a
// plain prop, and the props type has to admit it or `{...rest}` never carries
// it to the element. The guided tour focuses its own Next button through it.
type BaseProps = Omit<ComponentPropsWithRef<"button">, "children"> &
  Omit<Variants, "shape" | "size"> & {
    /** Covers the label with a spinner, keeping the width, and blocks further clicks. */
    loading?: boolean;
    /**
     * An icon button is named in a tooltip from its `aria-label` unless this
     * says otherwise; `false` opts out. Any other shape shows one only when given.
     */
    tooltip?: { label: string; shortcut?: string } | false;
  };

export type ButtonProps =
  | (BaseProps & { shape?: "control" | "pill"; size?: "sm" | "md" | "lg"; children: ReactNode })
  // An icon-only button carries no text, so it has to name itself.
  | (BaseProps & { shape: "icon"; size?: "xs" | "sm" | "md" | "lg"; children: ReactNode; "aria-label": string });

/** The spinner over a label that stays in the flow, so a loading control keeps its width. */
export function ButtonContent({ loading, children }: { loading: boolean; children: ReactNode }) {
  return (
    <>
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
    </>
  );
}

export function Button({
  variant,
  shape,
  size,
  loading = false,
  disabled,
  className,
  children,
  type = "button",
  tooltip,
  ...rest
}: ButtonProps) {
  const element = (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      // Only a disabled button dims; a loading one is busy, not unavailable.
      className={cx(buttonClass({ variant, shape, size }), disabled && !loading && "opacity-55", className)}
      {...rest}
    >
      <ButtonContent loading={loading}>{children}</ButtonContent>
    </button>
  );
  const named: ButtonProps["tooltip"] = tooltip ?? (shape === "icon" && { label: rest["aria-label"] as string });
  return named ? (
    <Tooltip label={named.label} shortcut={named.shortcut}>
      {element}
    </Tooltip>
  ) : (
    element
  );
}
