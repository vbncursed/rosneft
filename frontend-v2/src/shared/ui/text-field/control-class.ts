import { clsx as cx } from "clsx";

/** The shared input/textarea skin — one place so every field focuses alike. */
export function controlClass({
  mono = false,
  invalid = false,
  /** Off when a wrapper already carries the gap under the label. */
  spaced = true,
  className,
}: { mono?: boolean; invalid?: boolean; spaced?: boolean; className?: string } = {}) {
  return cx(
    "w-full rounded-control border px-3 py-2.5 text-fg outline-none transition-colors duration-150",
    "focus:border-accent focus:ring-[3px] focus:ring-accent-soft",
    "disabled:border-line disabled:text-dim disabled:opacity-60",
    spaced && "mt-[7px]",
    mono ? "font-mono text-[13px]" : "font-sans text-sm",
    invalid ? "border-bad bg-bad-soft" : "border-line-2 bg-panel-2",
    className,
  );
}
