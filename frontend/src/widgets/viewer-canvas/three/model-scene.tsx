import { useMemo, useRef } from "react";
import { Canvas } from "@react-three/fiber";
import { Bounds } from "@react-three/drei";
import type { Group } from "three";
import type { LodArtifact } from "@/entities/scene";
import type { SceneColors } from "../model/scene-colors";
import type { LodReport } from "../ui/props";
import { AutoLodClock } from "./auto-lod-clock";
import CameraRig from "./camera-rig";
import { CAMERA, DPR_RANGE, GL_CONFIG, GRID_POSITION } from "./canvas-config";
import ContextLossWatch from "./context-loss-watch";
import GltfModel from "./gltf-model";
import Ktx2Init from "./ktx2-init";
import Lighting from "./lighting";

export type ModelSceneProps = {
  lods: LodArtifact[];
  /** Bumped by the page's Try again: GltfModel clears drei's cached rejection and re-arms. */
  retryVersion: number;
  onLod: (report: LodReport) => void;
  colors: SceneColors;
  /** A lost WebGL context: the page shows its unavailable state. */
  onUnavailable: () => void;
};

const noop = () => {};

/**
 * One converted model on its own: the territory scene's parts without the
 * territory — no placements, panoramas, rulers or gizmo. Auto LOD, orbited by
 * CameraRig. Bounds mounts before the GLB has loaded (GltfModel suspends
 * inside it), so it frames an empty box; the model fits the default camera
 * because the converter normalises every mesh to max-axis 2.
 */
export default function ModelScene({ lods, retryVersion, onLod, colors, onUnavailable }: ModelSceneProps) {
  const modelRef = useRef<Group>(null);
  const bgArgs = useMemo<[string]>(() => [colors.background], [colors.background]);
  const gridArgs = useMemo<[number, number, string, string]>(() => [6, 24, colors.grid, colors.grid], [colors.grid]);
  return (
    <Canvas className="isolate" camera={CAMERA} gl={GL_CONFIG} dpr={DPR_RANGE} frameloop="demand">
      <color attach="background" args={bgArgs} />
      <Ktx2Init />
      <Lighting />
      <ContextLossWatch onLost={onUnavailable} />
      <AutoLodClock>
        <Bounds fit clip margin={1.2}>
          <GltfModel
            lods={lods}
            targetLod="auto"
            retryVersion={retryVersion}
            // Nothing here picks a surface; a no-op raycast keeps the wheel cheap on a 900k-triangle mesh.
            raycastable={false}
            groupRef={modelRef}
            onReport={onLod}
          />
        </Bounds>
      </AutoLodClock>
      <CameraRig resetVersion={0} playing={false} onPlayStop={noop} sceneRef={modelRef} />
      <gridHelper args={gridArgs} position={GRID_POSITION} />
    </Canvas>
  );
}
