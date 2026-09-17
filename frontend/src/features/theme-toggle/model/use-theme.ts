import { useEffect, useSyncExternalStore } from "react";
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

// One theme for the whole app, held outside React.
//
// It was component state, and that made every consumer its own island: the
// sidebar's toggle restyled <html> and told nobody, so the 3D canvas — which
// reads the tokens into three.js, because a WebGL clear colour cannot be a CSS
// variable — kept painting the old ground until something remounted it.
let current: Theme = stored() ?? systemTheme();
const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const getSnapshot = () => current;

// The page grounds index.html pairs with each OS scheme. An explicit choice
// overrides the scheme, so both tags take the chosen ground — otherwise a
// light OS would put a light browser bar over a dark page.
const CHROME: Record<Theme, string> = { dark: "#0e0f11", light: "#f5f4f1" };

function paintChrome(theme: Theme) {
  document.head
    .querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')
    .forEach((meta) => {
      meta.content = CHROME[theme];
    });
}

function toggle() {
  current = current === "dark" ? "light" : "dark";
  applyTheme(current);
  try {
    localStorage.setItem(KEY, current);
  } catch {
    // A remembered theme is a convenience, not something to fail over.
  }
  for (const listener of [...listeners]) listener();
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, getSnapshot);
  // Also on mount, so the first consumer stamps the remembered choice on the
  // document rather than waiting for someone to press the toggle.
  useEffect(() => {
    applyTheme(theme);
    paintChrome(theme);
  }, [theme]);
  return { theme, toggle };
}
