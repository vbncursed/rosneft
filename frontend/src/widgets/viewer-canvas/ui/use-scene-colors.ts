import { useEffect, useState } from "react";
import { useTheme } from "@/features/theme-toggle";
import { readSceneColors, type SceneColors } from "../model/scene-colors";

/** The three colours three.js needs, read off <html> and re-read when the theme flips. */
export function useSceneColors(): SceneColors {
  const { theme } = useTheme();
  const [colors, setColors] = useState<SceneColors>(() => readSceneColors(document.documentElement));
  // The tokens live on <html>, which useTheme's own effect restyles — there is
  // nothing to derive during render, only a DOM to re-read afterwards.
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- the tokens live on <html>, which useTheme restyles; nothing to derive in render, only a DOM to re-read afterwards
    setColors(readSceneColors(document.documentElement));
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- trigger, not input: theme is only the signal that useTheme restyled <html>; the tokens are read from the DOM
  }, [theme]);
  return colors;
}
