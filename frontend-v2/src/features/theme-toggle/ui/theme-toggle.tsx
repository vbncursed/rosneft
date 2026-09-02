import { useTheme } from "../model/use-theme";

/** The design's sidebar control: a label, and the theme currently in effect. */
export function ThemeToggle() {
  const { theme, toggle } = useTheme();

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Theme: ${theme}. Switch to ${theme === "dark" ? "light" : "dark"}`}
      className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-control border border-line bg-panel-2 px-3 py-[9px] text-xs text-fg transition-colors duration-150 hover:border-line-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <span>Theme</span>
      <span className="font-mono text-[11px] uppercase text-accent">{theme}</span>
    </button>
  );
}
