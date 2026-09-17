import { clsx as cx } from "clsx";

export type SkeletonProps = {
  /** Any CSS length; the design uses percentages for text and px for blocks. */
  width?: string;
  height?: string;
  rounded?: "sm" | "md";
  className?: string;
};

export function Skeleton({ width, height = "12px", rounded = "sm", className }: SkeletonProps) {
  return (
    <span
      aria-hidden="true"
      style={{ width, height }}
      className={cx(
        "block animate-pulse bg-panel-2 motion-reduce:animate-none",
        rounded === "sm" ? "rounded" : "rounded-control",
        className,
      )}
    />
  );
}
