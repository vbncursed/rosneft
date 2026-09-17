import { useQuery } from "@tanstack/react-query";
import { useParams, useSearch } from "@tanstack/react-router";
import { sceneQuery } from "@/entities/scene";
import { TerritoryConversionScreen } from "@/pages/territory-conversion";
import { TerritoryViewerScreen } from "@/pages/territory-viewer";
import { viewerRoute } from "./guard";

/**
 * One URL, one fetch, one branch — `viewerRoute` in guard.ts holds the
 * decision and has the spec. The loader primed the cache, so the bundle is
 * here on the first render; a conversion that finishes on the page invalidates
 * the same key and navigates to the bare path, and this component re-branches
 * into the viewer without a document load.
 */
export function TerritoryRoute() {
  const { slug } = useParams({ strict: false }) as { slug: string };
  const { jobId } = useSearch({ strict: false }) as { jobId?: string };
  const { data } = useQuery(sceneQuery(slug));
  return viewerRoute(data, jobId) ? <TerritoryViewerScreen /> : <TerritoryConversionScreen />;
}
