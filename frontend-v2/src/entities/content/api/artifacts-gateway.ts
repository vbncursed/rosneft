import { httpGet } from "@/shared/api";
import type { components } from "@/shared/api/dto";
import type { Artifact } from "../model/artifact";
import type { ContentKind } from "../model/content-item";

type ArtifactDto = components["schemas"]["Artifact"];

const route = (kind: ContentKind, slug: string) =>
  `/api/${kind === "territory" ? "territories" : "models"}/${encodeURIComponent(slug)}/artifacts`;

export const listArtifacts = async (kind: ContentKind, slug: string): Promise<Artifact[]> =>
  (await httpGet<ArtifactDto[]>(route(kind, slug))).map((a) => ({ lod: a.lod, size: a.size }));
