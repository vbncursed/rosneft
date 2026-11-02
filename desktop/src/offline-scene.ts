import { isHash } from "./validate";

type Hashed = { hash: string };
export type SceneLike = {
  territory: { slug: string; title: string };
  artifact?: Hashed & { artifacts?: Hashed[] };
  placements: { modelSlug: string }[];
  modelOptions: { slug: string; thumbnailBlobHash?: string; artifacts: Hashed[] }[];
  panoramas?: { sourceBlobHash: string; thumbnailBlobHash?: string }[];
  documents?: { sourceBlobHash: string }[];
};

/** Everything the viewer fetches from /api/assets for this territory: every LOD (the level follows screen size), placed models only. */
export function sceneHashes(scene: SceneLike): string[] {
  const placed = new Set(scene.placements.map((p) => p.modelSlug));
  const all = [
    scene.artifact?.hash,
    ...(scene.artifact?.artifacts ?? []).map((a) => a.hash),
    ...scene.modelOptions.flatMap((m) =>
      placed.has(m.slug) ? [m.thumbnailBlobHash, ...m.artifacts.map((a) => a.hash)] : [],
    ),
    ...(scene.panoramas ?? []).flatMap((p) => [p.sourceBlobHash, p.thumbnailBlobHash]),
    ...(scene.documents ?? []).map((d) => d.sourceBlobHash),
  ];
  return [...new Set(all.filter(isHash))];
}
