import { useEffect, useState } from "react";
import { applyTheme, type Theme } from "@/shared/lib/theme";

const KEY = "andrey.theme";

const stored = (): Theme | null => {
  try {
    const value = localStorage.getItem(KEY);
    return value === "dark" || value === "light" ? value : null;
  } catch {
    // Private windows and blocked site data throw on read; the OS preference
    // is a perfectly good answer.
    return null;
  }
};

/** The theme the OS asks for, used until someone chooses otherwise. */
export const systemTheme = (): Theme =>
  globalThis.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => stored() ?? systemTheme());

  useEffect(() => {
    applyTheme(theme);
    try {
      localStorage.setItem(KEY, theme);
    } catch {
      // A remembered theme is a convenience, not something to fail over.
    }
  }, [theme]);

  return { theme, toggle: () => setTheme((t) => (t === "dark" ? "light" : "dark")) };
}
