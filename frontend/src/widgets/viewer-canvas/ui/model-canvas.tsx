import { memo } from "react";
import LodErrorBoundary from "../three/lod-error-boundary";
import ModelScene from "../three/model-scene";
import type { ModelCanvasProps } from "./props";
import { useSceneColors } from "./use-scene-colors";

/**
 * The model viewer, coloured from the theme tokens. R3F's Canvas throws when
 * WebGL will not start; the boundary turns that into onUnavailable and draws
 * nothing, so the page can say so instead of the router's error panel.
 * Memoised for the same reason ViewerCanvas is: a page re-render must not reach the scene.
 */
export const ModelCanvas = memo(function ModelCanvas({ onUnavailable, ...scene }: ModelCanvasProps) {
  const colors = useSceneColors();
  return (
    <LodErrorBoundary resetKey="model" onError={onUnavailable}>
      <ModelScene {...scene} colors={colors} />
    </LodErrorBoundary>
  );
});
