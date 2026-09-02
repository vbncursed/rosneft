import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { clsx as cx } from "clsx";

const badge = cva(
  "inline-flex items-center gap-1.5 border font-mono whitespace-nowrap",
  {
    variants: {
      tone: {
        ok: "border-ok text-ok",
        warn: "border-warn text-warn",
        bad: "border-bad text-bad",
        accent: "border-accent text-accent",
        neutral: "border-line-2",
        dim: "border-line text-dim",
      },
      // soft adds the tinted ground; outline is the bare ring the design uses
      // for 2FA columns and secondary role pills.
      fill: { soft: "", outline: "bg-transparent" },
      shape: {
        pill: "rounded-full uppercase",
        tag: "rounded uppercase",
        // The People section's chips: squarer, and set in sentence case.
        chip: "rounded-[6px] normal-case",
      },
      size: {
        sm: "px-2.5 py-0.5 text-[9px] tracking-[0.14em]",
        md: "px-2.5 py-[3px] text-[10px] tracking-[0.16em]",
      },
    },
    compoundVariants: [
      { fill: "soft", tone: "ok", class: "bg-ok-soft" },
      { fill: "soft", tone: "warn", class: "bg-warn-soft" },
      { fill: "soft", tone: "bad", class: "bg-bad-soft" },
      { fill: "soft", tone: "accent", class: "bg-accent-soft" },
      { fill: "soft", tone: "neutral", class: "bg-panel-2 text-fg" },
      { fill: "outline", tone: "neutral", class: "text-muted" },
      { fill: "soft", tone: "dim", class: "bg-panel-2" },
      { shape: "tag", size: "sm", class: "px-1.5 py-px" },
      { shape: "tag", size: "md", class: "px-[7px] py-0.5 tracking-[0.14em]" },
      { shape: "chip", size: "sm", class: "px-2 py-px tracking-[0.06em]" },
      { shape: "chip", size: "md", class: "px-[9px] py-[3px] text-[10px] tracking-[0.06em]" },
    ],
    defaultVariants: { tone: "neutral", fill: "soft", shape: "pill", size: "md" },
  },
);

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badge>;

export function Badge({ tone, fill, shape, size, className, ...rest }: BadgeProps) {
  return <span className={cx(badge({ tone, fill, shape, size }), className)} {...rest} />;
}
