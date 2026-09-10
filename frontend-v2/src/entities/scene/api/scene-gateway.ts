import { httpGet } from "@/shared/api";
import type { components } from "@/shared/api/dto";
import type { Placement, Vec3 } from "@/entities/placement";
import { toTerritory, type Territory } from "@/entities/territory";
import type { LodArtifact } from "../model/lod";

type BundleDto = components["schemas"]["SceneBundle"];
type ArtifactDto = components["schemas"]["Artifact"];
type PlacementDto = components["schemas"]["Placement"];
type OptionDto = components["schemas"]["AssetOption"];

export type SceneArtifact = {
  lod: number;
  hash: string;
  size: number;
  vertices: number;
  faces: number;
  bboxMin: Vec3;
  bboxMax: Vec3;
  /** Every converted level, LOD0 included; /scene is the one call that carries it. */
  chain: LodArtifact[];
};

export type ModelOption = {
  slug: string;
  title: string;
  thumbnailBlobHash?: string;
  bboxMin?: Vec3;
  bboxMax?: Vec3;
  chain: LodArtifact[];
};

export type SceneBundle = {
  territory: Territory;
  artifact: SceneArtifact | null;
  placements: Placement[];
  modelOptions: ModelOption[];
};

const ZERO: Vec3 = { x: 0, y: 0, z: 0 };

const toArtifact = (a: ArtifactDto): SceneArtifact => ({
  lod: a.lod,
  hash: a.hash,
  size: a.size,
  vertices: a.vertices ?? 0,
  faces: a.faces ?? 0,
  bboxMin: a.bboxMin ?? ZERO,
  bboxMax: a.bboxMax ?? ZERO,
  // An older gateway answers without the chain; the artifact is then its own one-entry chain.
  chain: a.artifacts ?? [
    { lod: a.lod, hash: a.hash, size: a.size, vertices: a.vertices, faces: a.faces },
  ],
});

const toPlacement = (d: PlacementDto): Placement => ({
  id: d.id,
  territorySlug: d.territorySlug,
  modelSlug: d.modelSlug,
  position: d.position,
  rotation: d.rotation,
  scale: d.scale,
  label: d.label ?? "",
  updatedAt: d.updatedAt ?? "",
  visiblePanoramaIds: d.visiblePanoramaIds ?? [],
});

const toOption = (o: OptionDto): ModelOption => ({
  slug: o.slug,
  title: o.title,
  thumbnailBlobHash: o.thumbnailBlobHash,
  bboxMin: o.bboxMin,
  bboxMax: o.bboxMax,
  chain: o.artifacts ?? [],
});

/** One round trip for the viewer: the territory, its LOD chain, the placements and every placeable model. */
export async function getSceneBundle(slug: string): Promise<SceneBundle> {
  const d = await httpGet<BundleDto>(`/api/territories/${encodeURIComponent(slug)}/scene`);
  return {
    territory: toTerritory(d.territory),
    artifact: d.artifact ? toArtifact(d.artifact) : null,
    placements: d.placements.map(toPlacement),
    modelOptions: d.modelOptions.map(toOption),
  };
}
