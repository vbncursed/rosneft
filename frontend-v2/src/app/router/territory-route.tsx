import { useQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { sceneQuery, sceneReady } from "@/entities/scene";
import { TerritoryConversionScreen } from "@/pages/territory-conversion";
import { TerritoryViewerScreen } from "@/pages/territory-viewer";

/**
 * One URL, one fetch, one branch: a territory with a LOD0 is the viewer,
 * anything else is the conversion page. The loader primed the cache, so the
 * bundle is here on the first render; a conversion that finishes on the page
 * invalidates the same key and this component re-branches into the viewer
 * without a document load.
 */
export function TerritoryRoute() {
  const { slug } = useParams({ strict: false }) as { slug: string };
  const { data } = useQuery(sceneQuery(slug));
  if (data && sceneReady(data)) return <TerritoryViewerScreen />;
  return <TerritoryConversionScreen />;
}
