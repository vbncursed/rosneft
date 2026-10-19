import { memo } from "react";
import SceneCanvas from "../three/scene-canvas";
import type { ViewerCanvasProps } from "./props";
import { useSceneColors } from "./use-scene-colors";

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
  const colors = useSceneColors();
  return <SceneCanvas {...props} colors={colors} />;
});
