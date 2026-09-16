import { clsx as cx } from "clsx";

export type StatsStripProps = {
  items: string[];
  tone?: "neutral" | "bad";
  /** State 3: the last item names what is loading, in accent. */
  accentLast?: boolean;
  label?: string;
  className?: string;
};

/**
 * The bottom-left line of facts about the scene: dimensions, counts, the level
 * on screen.
 *
 * `role="status"` in every tone, the bad one included. The error card beside it
 * is the `alert`, and two alerts meant a screen reader read the strip and the
 * card back to back; the strip is context for the card, not a second warning.
 */
export function StatsStrip({ items, tone = "neutral", accentLast = false, label = "Scene stats", className }: StatsStripProps) {
  const last = items.length - 1;
  return (
    <div
      role="status"
      aria-label={label}
      className={cx(
        "flex flex-wrap items-center gap-3.5 rounded-[10px] border bg-panel px-3.5 py-[9px] font-mono text-[10px] text-muted tabular-nums shadow-elevation",
        tone === "bad" ? "border-bad" : "border-line-2",
        className,
      )}
    >
      {items.map((item, i) => {
        const tint =
          i === last && accentLast
            ? "text-accent"
            : i === 0
              ? tone === "bad"
                ? "text-bad"
                : "text-fg"
              : undefined;
        return (
          <span key={`${i}-${item}`} className={tint}>
            {item}
          </span>
        );
      })}
    </div>
  );
}
