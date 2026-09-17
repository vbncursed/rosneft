import { queryOptions } from "@tanstack/react-query";
import { getSceneBundle } from "./scene-gateway";

/**
 * The viewer's one fetch. 30 s: every write the viewer sends — placements,
 * panoramas, documents, measurements — invalidates it explicitly, because the
 * page seeds its lists from this cache when a reader comes back in the SPA.
 * Another reader's edits still wait for the 30 s or a reload.
 */
export const sceneQuery = (slug: string) =>
  queryOptions({ queryKey: ["scene", slug], queryFn: () => getSceneBundle(slug), staleTime: 30_000 });
