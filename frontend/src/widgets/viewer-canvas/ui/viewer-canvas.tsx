import { useEffect, useState } from "react";
import { useTheme } from "@/features/theme-toggle";
import { readSceneColors, type SceneColors } from "../model/scene-colors";
import SceneCanvas from "../three/scene-canvas";
import type { ViewerCanvasProps } from "./props";

/**
 * The scene, coloured from the tokens and re-read when the theme flips.
 *
 * The Canvas is a context boundary — nothing inside it can read the theme, the
 * query client or the permission set — so the three colours three.js needs
 * cross it as a plain prop.
 */
export function ViewerCanvas(props: ViewerCanvasProps) {
  const { theme } = useTheme();
  const [colors, setColors] = useState<SceneColors>(() =>
    readSceneColors(document.documentElement),
  );
  // The tokens live on <html>, which useTheme's own effect restyles — there is
  // nothing to derive during render, only a DOM to re-read afterwards.
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect
    setColors(readSceneColors(document.documentElement));
  }, [theme]);
  return <SceneCanvas {...props} colors={colors} />;
}
