export type Theme = "dark" | "light";

/** Explicit choice wins over the OS preference; null hands control back to it. */
export function applyTheme(theme: Theme | null, root: HTMLElement = document.documentElement) {
  if (theme === null) root.removeAttribute("data-theme");
  else root.dataset.theme = theme;
}
