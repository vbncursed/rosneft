import { createRoute, notFound } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { authedLayoutRoute } from "@/routes/layout";
import { sceneBundleQuery } from "@/territory/application/scene-bundle-query";
import { toSceneViewModel } from "@/viewer/application/scene-view-model";
import { HttpError } from "@/shared/infrastructure/http/http-error";
import ViewerEntry from "@/viewer/presentation/components/viewer-entry";
import ViewerSkeleton from "@/viewer/presentation/components/viewer-skeleton";
import ConversionPending from "@/conversion/presentation/conversion-pending";

function TerritoryViewer() {
  const { slug } = territoryViewerRoute.useParams();
  const { jobId } = territoryViewerRoute.useSearch();
  const { data: bundle } = useQuery(sceneBundleQuery(slug));
  if (!bundle) return <ViewerSkeleton />; // loader primed the cache; type guard

  const scene = toSceneViewModel(bundle);
  if (!scene) {
    return <ConversionPending title={bundle.territory.title} slug={slug} jobId={jobId ?? null} kind="territory" />;
  }
  return (
    <main className="relative h-screen w-screen overflow-hidden bg-black">
      <ViewerEntry
        parentLods={scene.parentLods}
        title={bundle.territory.title}
        metadata={scene.metadata}
        territorySlug={slug}
        initialPlacements={scene.placements}
        modelOptions={bundle.modelOptions}
        panoramas={bundle.panoramas}
        documents={bundle.documents}
        externalPanoramaUrl={bundle.territory.externalPanoramaUrl}
      />
    </main>
  );
}

export const territoryViewerRoute = createRoute({
  getParentRoute: () => authedLayoutRoute,
  path: "/territories/$slug",
  validateSearch: (s: Record<string, unknown>): { jobId?: string } => ({
    jobId: typeof s.jobId === "string" ? s.jobId : undefined,
  }),
  loader: async ({ context, params }) => {
    try {
      await context.queryClient.ensureQueryData(sceneBundleQuery(params.slug));
    } catch (e) {
      if (e instanceof HttpError && e.status === 404) throw notFound();
      throw e;
    }
  },
  pendingComponent: ViewerSkeleton,
  component: TerritoryViewer,
});
