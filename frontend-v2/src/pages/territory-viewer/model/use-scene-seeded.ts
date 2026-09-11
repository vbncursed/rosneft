import { useQuery } from "@tanstack/react-query";
import { getSceneBundle, sceneQuery } from "@/entities/scene";

/**
 * Whether the scene bundle is already in the query cache.
 *
 * `usePlacementsEditor` seeds its list once, at mount, from whatever
 * `useTerritoryViewer` holds on its first render — and a page opened cold holds
 * nothing, so the editor would seed empty and stay that way for the life of the
 * page. The screen keys the component that owns the editor on this answer, so
 * the body mounts once with nothing and once, for good, with the bundle.
 *
 * It is the same query the container runs, so TanStack deduplicates it: this
 * reads the cache, it does not fetch a second time.
 */
export function useSceneSeeded(slug: string): boolean {
  return useQuery({ ...sceneQuery(slug), queryFn: () => getSceneBundle(slug) }).data !== undefined;
}
