export type SceneColors = { background: string; grid: string; accent: string };

const DARK: SceneColors = { background: "#16181b", grid: "#282c31", accent: "#f97316" };

const read = (root: HTMLElement, name: string, fallback: string) =>
  getComputedStyle(root).getPropertyValue(name).trim() || fallback;

/**
 * three.js takes no CSS variables; the scene's three colours are read once per
 * theme. The grid helper's two colours both read `--line` — `--grid` is a 4 %
 * alpha, too faint for three's grid lines.
 */
export const readSceneColors = (root: HTMLElement): SceneColors => ({
  background: read(root, "--panel", DARK.background),
  grid: read(root, "--line", DARK.grid),
  accent: read(root, "--accent", DARK.accent),
});
