import { type RefObject, useEffect } from "react";
import { BackSide, type Mesh, type Texture } from "three";
import type { Panorama } from "@/panorama/domain/panorama";

interface PanoramaSphereProps {
  panorama: Panorama;
  // Fully-loaded, sRGB-tagged, U-flipped equirect from usePanoramaTexture.
  texture: Texture;
  meshRef: RefObject<Mesh | null>;
  // < 1 ghosts the equirect over the model for overlay calibration.
  opacity?: number;
}

// PanoramaSphere is the equirect skybox. Inverted sphere (BackSide) so the
// camera sees the texture from the inside. Radius=50 puts the sphere well
// outside any practical placement; the placement snap-raycaster uses this
// mesh as its "surface" in panorama mode, so equipment dropped in the
// panorama view ends up at distance ~50 from the anchor.
//
// rotation-y = yawOffset aligns the panorama's implicit "north" with the
// territory's axes. Set per-panorama by the operator who knows the capture
// orientation.
//
// Raycast strategy: pointer events should NOT hit the sphere (a click in the
// open sky should bubble up as onPointerMissed → deselect). But the snap
// raycaster traverses meshes via `userData.origRaycast` first — so we stash
// the default raycast there and disable the public one, matching the same
// trick gltf-model uses for the territory.
export default function PanoramaSphere({ panorama, texture, meshRef, opacity = 1 }: PanoramaSphereProps) {
  // After the mesh mounts, stash the prototype raycast for snap and replace
  // the instance raycast with a noop. Re-runs whenever the mesh identity
  // changes (new panorama → new mesh ref).
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const proto = Object.getPrototypeOf(mesh) as { raycast: Mesh["raycast"] };
    mesh.userData.origRaycast = proto.raycast;
    mesh.raycast = () => {};
    return () => {
      mesh.raycast = proto.raycast;
      delete mesh.userData.origRaycast;
    };
  }, [meshRef, panorama.id]);

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
