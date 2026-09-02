import { clsx as cx } from "clsx";
import { initials } from "./initials";

export type AvatarProps = {
  /** Full name or username; the initials are derived from it. */
  name: string;
  active?: boolean;
  size?: number;
  className?: string;
};

export function Avatar({ name, active = false, size = 36, className }: AvatarProps) {
  return (
    <span
      role="img"
      aria-label={name}
      style={{ width: size, height: size }}
      className={cx(
        "inline-flex shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
        active ? "border-accent bg-accent text-accent-fg" : "border-line-2 bg-panel-2 text-fg",
        className,
      )}
    >
      <span aria-hidden="true">{initials(name)}</span>
    </span>
  );
}
