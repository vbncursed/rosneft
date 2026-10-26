import { memo, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { DoubleSide, SRGBColorSpace, Texture, type MeshBasicMaterial } from "three";
import { applyFit, type Similarity } from "@/entities/site-plan";

/** The PDF page's size in points and the similarity that carries page points to the ground plane. */
export type PlanFit = { similarity: Similarity; page: { width: number; height: number } };

interface PlanOverlayProps {
  image: ImageBitmap;
  fit: PlanFit;
  /** The territory's median ground height: the quad lies flat there. */
  groundY: number;
  opacity: number;
}

// The picture's top-left is the page's origin, so v runs down with the page.
const UV = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]);
const INDEX = new Uint16Array([0, 1, 2, 0, 2, 3]);
const noRaycast = () => undefined;

/**
 * The aligned plan as one textured quad. Like the zones it is mounted outside
 * the scene wrapper and offers no ray test, so it is never solid and never
 * picked.
 */
function PlanOverlayImpl({ image, fit, groundY, opacity }: PlanOverlayProps) {
  const { similarity, page } = fit;
  const material = useRef<MeshBasicMaterial>(null);

  const texture = useMemo(() => {
    const t = new Texture(image);
    t.colorSpace = SRGBColorSpace;
    // An ImageBitmap is uploaded as it is, top row first; three ignores flipY for it.
    t.flipY = false;
    t.needsUpdate = true;
    return t;
  }, [image]);
  useEffect(() => () => texture.dispose(), [texture]);

  const positions = useMemo(() => {
    const corners = [
      { x: 0, y: 0 },
      { x: page.width, y: 0 },
      { x: page.width, y: page.height },
      { x: 0, y: page.height },
    ].map((c) => applyFit(similarity, c));
    return new Float32Array(corners.flatMap((c) => [c.x, groundY, c.z]));
  }, [similarity, page.width, page.height, groundY]);

  // three bakes `#define OPAQUE` into the program it compiles while `transparent`
  // is false, and does not re-check the flag per frame: flip it without a new
  // program and the opacity is uploaded and thrown away by the shader.
  const transparent = opacity < 1;
  useLayoutEffect(() => {
    if (material.current) material.current.needsUpdate = true;
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- trigger, not input: the flip is what needs the recompile
  }, [transparent]);

  return (
    <mesh name="PlanOverlay" raycast={noRaycast} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-uv" args={[UV, 2]} />
        <bufferAttribute attach="index" args={[INDEX, 1]} />
      </bufferGeometry>
      <meshBasicMaterial
        ref={material}
        map={texture}
        transparent={transparent}
        opacity={opacity}
        depthWrite={false}
        side={DoubleSide}
        toneMapped={false}
      />
    </mesh>
  );
}

export default memo(PlanOverlayImpl);
