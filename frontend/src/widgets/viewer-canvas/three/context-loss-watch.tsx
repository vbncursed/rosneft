import { useEffect } from "react";
import { useThree } from "@react-three/fiber";

/**
 * Reports a lost WebGL context (GPU reset, memory pressure in a background
 * tab) to the page. Preventing the default keeps the browser from dropping the
 * context for good; the page shows its unavailable state either way. Mounted
 * inside the Canvas because only useThree reaches the renderer's canvas.
 */
export default function ContextLossWatch({ onLost }: { onLost: () => void }) {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    const canvas = gl.domElement;
    const onContextLost = (event: Event) => {
      event.preventDefault();
      onLost();
    };
    canvas.addEventListener("webglcontextlost", onContextLost);
    return () => canvas.removeEventListener("webglcontextlost", onContextLost);
  }, [gl, onLost]);
  return null;
}
