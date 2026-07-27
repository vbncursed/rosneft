import type { SceneBundle } from "@/territory/domain/scene-bundle";
import { bboxAxis } from "@/shared/domain/artifact";
import type { LodArtifact } from "@/shared/domain/lod-artifact";
import type { Placement, ResolvedPlacement } from "@/placement/domain/placement";
import type { PlacementAssetOption } from "@/placement/domain/asset-option";
import type { ModelMetadata } from "@/viewer/domain/model-metadata";

function resolvePlacements(
  placements: Placement[],
  options: PlacementAssetOption[],
): ResolvedPlacement[] {
  const lodsBySlug = new Map(options.map((o) => [o.slug, o.lods]));
  return placements.map((p) => ({ ...p, lods: lodsBySlug.get(p.modelSlug) ?? [] }));
}

export interface SceneViewModel {
  parentLods: LodArtifact[];
  metadata: ModelMetadata;
  placements: ResolvedPlacement[];
}

// Pure bundle → view-model. Returns null when the LOD0 artifact is absent so
// the route falls back to the conversion-pending screen. Mirrors the old RSC
// page.tsx body.
export function toSceneViewModel(bundle: SceneBundle): SceneViewModel | null {
  const { territory, artifact, placements, modelOptions } = bundle;
  if (!artifact) return null;

  const parentLods: LodArtifact[] = artifact.lods ?? [
    { lod: artifact.lod, hash: artifact.hash, size: artifact.size, vertices: artifact.vertices, faces: artifact.faces },
  ];

  const metadata: ModelMetadata = {
    name: territory.title,
    vertices: artifact.vertices ?? 0,
    faces: artifact.faces ?? 0,
    dimensions: {
      x: bboxAxis(artifact.bboxMin?.x, artifact.bboxMax?.x),
      y: bboxAxis(artifact.bboxMin?.y, artifact.bboxMax?.y),
      z: bboxAxis(artifact.bboxMin?.z, artifact.bboxMax?.z),
    },
  };

  return { parentLods, metadata, placements: resolvePlacements(placements, modelOptions) };
}
