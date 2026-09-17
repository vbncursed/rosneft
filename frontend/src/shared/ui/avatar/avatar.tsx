import { clsx as cx } from "clsx";
import { initials } from "./initials";

/**
 * plain is everyone; solid marks the identity in the navigation bar; soft is
 * the People section's owner badge; outline is the person inspector's header,
 * where the accent ring sits on the panel rather than a tint.
 */
export type AvatarVariant = "plain" | "solid" | "soft" | "outline";

export type AvatarProps = {
  /** Full name or username; the initials are derived from it. */
  name: string;
  variant?: AvatarVariant;
  size?: number;
  className?: string;
};

const SKIN: Record<AvatarVariant, string> = {
  plain: "border-line-2 bg-panel-2 text-fg",
  solid: "border-accent bg-accent text-accent-fg",
  soft: "border-accent bg-accent-soft text-accent",
  outline: "border-accent bg-panel text-accent",
};

export function Avatar({ name, variant = "plain", size = 36, className }: AvatarProps) {
  return (
    <span
      role="img"
      aria-label={name}
      style={{ width: size, height: size }}
      className={cx(
        "inline-flex shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
        SKIN[variant],
        className,
      )}
    >
      <span aria-hidden="true">{initials(name)}</span>
    </span>
  );
}
