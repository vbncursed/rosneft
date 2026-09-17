import type { ResolvedPlacement, Vec3 } from "@/entities/placement";
import type { Panorama, SourceBbox } from "@/entities/panorama";
import type { Document } from "@/entities/document";
import type { StoredChain } from "@/entities/measurement";
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
  panoramas: Panorama[];
  documents: Document[];
  /** Saved chains, as the bundle carried them; the measure tool seeds from these once. */
  measurements: StoredChain[];
  /** Source-unit LOD0 bbox for EXIF anchoring; null when the artifact carries the zero fallback on both ends. */
  sourceBbox: SourceBbox | null;
};

/** The route's branch: the viewer needs a LOD0; anything else is the conversion page. */
export const sceneReady = (bundle: SceneBundle): boolean =>
  bundle.artifact !== null && bundle.artifact.chain.some((a) => a.lod === 0);

const axis = (min: number, max: number) => Number((max - min).toFixed(2));

const isZero = (v: Vec3) => v.x === 0 && v.y === 0 && v.z === 0;

/** Pure bundle → what the viewer renders. Null when nothing is converted. */
export function toSceneViewModel(bundle: SceneBundle): SceneViewModel | null {
  const { territory, artifact, placements, modelOptions, panoramas, documents, measurements } = bundle;
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
    panoramas,
    documents,
    measurements,
    sourceBbox:
      isZero(artifact.bboxMin) && isZero(artifact.bboxMax)
        ? null
        : { min: artifact.bboxMin, max: artifact.bboxMax },
  };
}
