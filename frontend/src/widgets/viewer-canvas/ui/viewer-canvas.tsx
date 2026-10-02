import { memo, useEffect, useState } from "react";
import { useTheme } from "@/features/theme-toggle";
import { readSceneColors, type SceneColors } from "../model/scene-colors";
import SceneCanvas from "../three/scene-canvas";
import type { ViewerCanvasProps } from "./props";

/**
 * The scene, coloured from the tokens and re-read when the theme flips.
 *
 * The Canvas is a context boundary. Nothing inside it can read the theme, the
 * query client or the permission set, so the three colours three.js needs
 * cross it as a plain prop.
 *
 * Memoised: the page re-renders on every panel fold, tab switch and search
 * keystroke, and each re-render used to reconcile the whole three.js scene. The
 * page keeps every prop's identity across those (`use-territory-viewer.spec`
 * "a folding list" pins it), so the shallow compare is enough.
 */
export const ViewerCanvas = memo(function ViewerCanvas(props: ViewerCanvasProps) {
  const { theme } = useTheme();
  const [colors, setColors] = useState<SceneColors>(() => readSceneColors(document.documentElement));
  // The tokens live on <html>, which useTheme's own effect restyles — there is
  // nothing to derive during render, only a DOM to re-read afterwards.
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- the tokens live on <html>, which useTheme restyles; nothing to derive in render, only a DOM to re-read afterwards
    setColors(readSceneColors(document.documentElement));
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- trigger, not input: theme is only the signal that useTheme restyled <html>; the tokens are read from the DOM
  }, [theme]);
  return <SceneCanvas {...props} colors={colors} />;
});
