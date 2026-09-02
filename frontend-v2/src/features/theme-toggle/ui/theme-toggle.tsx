import { clsx as cx } from "clsx";
import { Icon } from "@/shared/ui/icon";
import { useTheme } from "../model/use-theme";

export type ThemeToggleProps = {
  /** The row's own label; the console sidebar calls this "Appearance". */
  label?: string;
  /** compact drops the label and rounds the button, as the login screen does. */
  variant?: "labelled" | "compact";
};

/** The console sidebar's control: a label, and the theme currently in effect. */
export function ThemeToggle({ label = "Appearance", variant = "labelled" }: ThemeToggleProps) {
  const { theme, toggle } = useTheme();

  const button = (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Theme: ${theme}. Switch to ${theme === "dark" ? "light" : "dark"}`}
      className={cx(
        "flex cursor-pointer items-center gap-1.5 border bg-panel font-mono text-[9px] uppercase tracking-[0.16em] text-fg transition-colors duration-150 hover:border-accent-line focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        variant === "compact"
          ? "rounded-full border-line-2 bg-panel-2 px-3 py-[5px]"
          : "rounded-[7px] border-line-2 px-[9px] py-1",
      )}
    >
      <Icon name="moon" size={12} className="text-accent" />
      {theme}
    </button>
  );

  if (variant === "compact") return button;

  return (
    <div className="flex items-center justify-between gap-2 rounded-[9px] border border-line bg-panel-2 py-1.5 pl-[11px] pr-2">
      <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted">{label}</span>
      {button}
    </div>
  );
}
