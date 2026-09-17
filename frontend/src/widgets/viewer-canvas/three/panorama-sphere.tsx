import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import {
  BackSide,
  RepeatWrapping,
  SRGBColorSpace,
  Texture,
  type Mesh,
  type MeshBasicMaterial,
} from "three";
import type { Panorama } from "@/entities/panorama";

interface PanoramaSphereProps {
  panorama: Panorama;
  /** The decoded equirect from `usePanoramaTexture`; this mesh owns it from here. */
  bitmap: ImageBitmap;
  /** < 1 ghosts the equirect over the model for overlay calibration. */
  opacity?: number;
}

// PanoramaSphere is the equirect skybox: an inverted sphere (BackSide) the
// camera sits inside of. rotation-y = yawOffset aligns the panorama's implicit
// "north" with the territory's axes, set per-panorama by the operator who knows
// the capture orientation.
//
// The Texture is built HERE rather than in the feature hook that downloaded the
// bytes: a `three` import under `features/` is hoisted out of the lazy
// viewer-canvas chunk and into `index`, so every reader of every other screen
// would download and parse three before first paint.
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
export default function PanoramaSphere({ panorama, bitmap, opacity = 1 }: PanoramaSphereProps) {
  const meshRef = useRef<Mesh>(null);
  const materialRef = useRef<MeshBasicMaterial>(null);
  // < 1 is the calibration ghost; 1 is every other second the reader spends
  // inside a capture.
  const ghosting = opacity < 1;

  const texture = useMemo(() => {
    const t = new Texture(bitmap);
    // The bitmap arrives pre-flipped: WebGL cannot apply flipY to one, so a
    // plain `new Texture(bitmap)` would render the equirect upside down.
    t.flipY = false;
    // Equirect JPGs encode sRGB but three doesn't tag them, and mapped onto the
    // inside of a BackSide sphere they read horizontally mirrored. Fix both:
    // tag sRGB, and flip the U axis (repeat.x = -1, offset.x = 1 keeps samples
    // in [0,1] while reversing direction).
    t.colorSpace = SRGBColorSpace;
    t.wrapS = RepeatWrapping;
    t.repeat.x = -1;
    t.offset.x = 1;
    t.needsUpdate = true;
    return t;
  }, [bitmap]);

  // The GL texture is this mesh's to free. The ImageBitmap behind it is NOT:
  // this cleanup also runs on StrictMode's dev remount, and a closed bitmap
  // cannot be uploaded again — the sphere came back black, in dev only, which
  // is the worst place to hide it. `usePanoramaTexture` closes the bitmap it
  // downloaded, where "the capture changed or the reader left" is knowable.
  useEffect(() => () => texture.dispose(), [texture]);

  // three bakes `#define OPAQUE` — which hard-sets the fragment's alpha to 1.0
  // — into the program it compiles while `transparent` is false, and
  // `transparent` is not one of the properties `setProgram` re-checks per
  // frame. Flipping it alone therefore left the sphere blending at source
  // alpha 1: the slider moved `opacity`, the shader threw it away, and the
  // photo painted fully opaque at every setting. `needsUpdate` bumps
  // `material.version`, which is the one thing three does re-check.
  //
  // Layout, not passive: R3F flips `transparent` in the mutation phase and
  // schedules the next frame on a rAF, and a passive effect's ordering against
  // that rAF is not guaranteed — one frame could still draw the stale program.
  useLayoutEffect(() => {
    if (materialRef.current) materialRef.current.needsUpdate = true;
  }, [ghosting]);

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
      renderOrder={ghosting ? 1000 : 0}
    >
      <sphereGeometry args={[50, 64, 32]} />
      <meshBasicMaterial
        ref={materialRef}
        map={texture}
        side={BackSide}
        toneMapped={false}
        transparent={ghosting}
        opacity={opacity}
        depthTest={!ghosting}
        depthWrite={!ghosting}
      />
    </mesh>
  );
}
