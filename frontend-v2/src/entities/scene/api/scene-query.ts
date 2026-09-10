import { queryOptions } from "@tanstack/react-query";
import { getSceneBundle } from "./scene-gateway";

/**
 * The viewer's one fetch. 30 s: a placement edit invalidates it explicitly;
 * nothing else changes the bundle under a reader.
 */
export const sceneQuery = (slug: string) =>
  queryOptions({ queryKey: ["scene", slug], queryFn: () => getSceneBundle(slug), staleTime: 30_000 });
