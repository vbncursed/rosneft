import type { ResolvedPlacement, Vec3 } from "@/entities/placement";
import type { SceneBundle } from "../api/scene-gateway";
import type { LodArtifact } from "./lod";

export type SceneMetadata = {
  /** Source-unit extents of the LOD0 bbox. Zero on every axis when the artifact carries none. */
  dims: Vec3;
  units: "metres";
  vertices: number;
  faces: number;
  /** The territory's createdAt; the gateway records no uploader. */
  uploadedAt: string | null;
};

export type SceneViewModel = {
  parentLods: LodArtifact[];
  metadata: SceneMetadata;
  placements: ResolvedPlacement[];
};

/** The route's branch: the viewer needs a LOD0; anything else is the conversion page. */
export const sceneReady = (bundle: SceneBundle): boolean =>
  bundle.artifact !== null && bundle.artifact.chain.some((a) => a.lod === 0);

const axis = (min: number, max: number) => Number((max - min).toFixed(2));

/** Pure bundle → what the viewer renders. Null when nothing is converted. */
export function toSceneViewModel(bundle: SceneBundle): SceneViewModel | null {
  const { territory, artifact, placements, modelOptions } = bundle;
  if (!artifact) return null;
  const chainBySlug = new Map(modelOptions.map((o) => [o.slug, o.chain]));
  return {
    parentLods: artifact.chain,
    metadata: {
      dims: {
        x: axis(artifact.bboxMin.x, artifact.bboxMax.x),
        y: axis(artifact.bboxMin.y, artifact.bboxMax.y),
        z: axis(artifact.bboxMin.z, artifact.bboxMax.z),
      },
      units: "metres",
      vertices: artifact.vertices,
      faces: artifact.faces,
      uploadedAt: territory.createdAt ?? null,
    },
    placements: placements.map((p) => ({ ...p, chain: chainBySlug.get(p.modelSlug) ?? [] })),
  };
}
