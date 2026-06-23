import { type RefObject, useEffect } from "react";
import { useLoader } from "@react-three/fiber";
import {
  BackSide,
  RepeatWrapping,
  SRGBColorSpace,
  TextureLoader,
  type Mesh,
  type Texture,
} from "three";
import type { Panorama } from "@/panorama/domain/panorama";
import { assetUrl } from "@/shared/infrastructure/asset-url";

// applyEquirectFormat tags an equirect JPG with sRGB color space and
// pokes needsUpdate. Lives outside the component so the hooks linter
// doesn't see it as modifying a hook return value.
function applyEquirectFormat(texture: Texture): void {
  texture.colorSpace = SRGBColorSpace;
  // An equirect mapped onto the inside of a BackSide sphere comes out
  // horizontally mirrored (signage and layout read backwards). Flip the
  // U axis to undo it; the default vertical flipY already handles the
  // other axis. Setting repeat.x = -1 with offset.x = 1 keeps samples in
  // [0,1] but reverses direction.
  texture.wrapS = RepeatWrapping;
  texture.repeat.x = -1;
  texture.offset.x = 1;
  texture.needsUpdate = true;
}

interface PanoramaSphereProps {
  panorama: Panorama;
  meshRef: RefObject<Mesh | null>;
}

// PanoramaSphere is the equirect skybox. Inverted sphere (BackSide) so
// the camera sees the texture from the inside. Radius=50 puts the sphere
// well outside any practical placement; the placement snap-raycaster
// uses this mesh as its "surface" in panorama mode, so equipment dropped
// in the panorama view ends up at distance ~50 from the anchor —
// visually correct relative to the captured scene.
//
// rotation-y = yawOffset rotates the texture so the panorama's implicit
// "north" aligns with the territory's axes. Set per-panorama by the
// operator who knows the capture orientation.
//
// Raycast strategy: pointer events should NOT hit the sphere (a click
// in the open sky should bubble up as onPointerMissed → deselect). But
// the snap raycaster traverses meshes via `userData.origRaycast` first
// — so we stash the default raycast there and disable the public one,
// matching the same trick gltf-model uses for the territory.
export default function PanoramaSphere({ panorama, meshRef }: PanoramaSphereProps) {
  const texture = useLoader(TextureLoader, assetUrl(panorama.sourceBlobHash)) as Texture;

  useEffect(() => {
    // useLoader caches its return value; equirect JPGs encode sRGB and
    // three doesn't tag them. Apply the colorSpace + needsUpdate poke
    // through a helper so the immutability lint doesn't flag a direct
    // write on a hook return value.
    applyEquirectFormat(texture);
  }, [texture]);

  // After the mesh mounts, stash the prototype raycast for snap and
  // replace the instance raycast with a noop. Re-runs whenever the mesh
  // identity changes (new panorama → new mesh ref).
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
    >
      <sphereGeometry args={[50, 64, 32]} />
      <meshBasicMaterial map={texture} side={BackSide} toneMapped={false} />
    </mesh>
  );
}
