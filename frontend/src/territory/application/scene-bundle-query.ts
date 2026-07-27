import { queryOptions } from "@tanstack/react-query";
import { getSceneBundle } from "@/territory/infrastructure/territory-gateway";

// One-shot territory scene (territory + LOD0 artifact + placements + model
// options + panoramas + documents). Key ["scene", slug] is also invalidated by
// the conversion watcher so the viewer re-renders once the artifact lands.
export const sceneBundleQuery = (slug: string) =>
  queryOptions({
    queryKey: ["scene", slug],
    queryFn: () => getSceneBundle(slug),
  });
