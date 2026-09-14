import { useEffect, useRef } from "react";
import { BackSide, type Mesh, type Texture } from "three";
import type { Panorama } from "@/entities/panorama";

interface PanoramaSphereProps {
  panorama: Panorama;
  /** Fully-loaded, sRGB-tagged, U-flipped equirect from usePanoramaTexture. */
  texture: Texture;
  /** < 1 ghosts the equirect over the model for overlay calibration. */
  opacity?: number;
}

// PanoramaSphere is the equirect skybox: an inverted sphere (BackSide) the
// camera sits inside of. rotation-y = yawOffset aligns the panorama's implicit
// "north" with the territory's axes, set per-panorama by the operator who knows
// the capture orientation.
//
// The sphere is unhittable on purpose. It encloses the whole scene, so any
// pointer ray that misses a placement would otherwise hit it, and a click into
// the open sky has to bubble up as onPointerMissed → deselect. The instance
// raycast is replaced with a no-op after mount and the prototype's put back on
// unmount, so nothing about the shared Mesh prototype leaks out of this file.
//
// Radius 50 is the old app's value and is kept as-is: it is far outside any
// practical placement, and nothing measures against it — the panorama snap
// raycaster that once used this mesh as a surface is not part of v2.
export default function PanoramaSphere({ panorama, texture, opacity = 1 }: PanoramaSphereProps) {
  const meshRef = useRef<Mesh>(null);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const proto = Object.getPrototypeOf(mesh) as { raycast: Mesh["raycast"] };
    mesh.raycast = () => {};
    return () => {
      mesh.raycast = proto.raycast;
    };
  }, []);

  return (
    <mesh
      ref={meshRef}
      position={[panorama.position.x, panorama.position.y, panorama.position.z]}
      rotation={[0, panorama.yawOffset, 0]}
      renderOrder={opacity < 1 ? 1000 : 0}
    >
      <sphereGeometry args={[50, 64, 32]} />
      <meshBasicMaterial
        map={texture}
        side={BackSide}
        toneMapped={false}
        transparent={opacity < 1}
        opacity={opacity}
        depthTest={opacity >= 1}
        depthWrite={opacity >= 1}
      />
    </mesh>
  );
}
