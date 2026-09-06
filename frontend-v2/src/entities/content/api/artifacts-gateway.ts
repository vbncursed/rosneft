import { httpGet } from "@/shared/api";
import type { components } from "@/shared/api/dto";
import type { Artifact, Vec3 } from "../model/artifact";
import type { ContentKind } from "../model/content-item";

type ArtifactDto = components["schemas"]["Artifact"];

const route = (kind: ContentKind, slug: string) =>
  `/api/${kind === "territory" ? "territories" : "models"}/${encodeURIComponent(slug)}/artifacts`;

const ZERO: Vec3 = { x: 0, y: 0, z: 0 };

const toArtifact = (a: ArtifactDto): Artifact => ({
  lod: a.lod,
  hash: a.hash,
  size: a.size,
  vertices: a.vertices ?? 0,
  faces: a.faces ?? 0,
  bboxMin: a.bboxMin ?? ZERO,
  bboxMax: a.bboxMax ?? ZERO,
});

export const listArtifacts = async (kind: ContentKind, slug: string): Promise<Artifact[]> =>
  (await httpGet<ArtifactDto[]>(route(kind, slug))).map(toArtifact);
