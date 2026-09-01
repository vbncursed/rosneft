import { createRoute, notFound } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { authedLayoutRoute } from "@/routes/layout";
import { requirePermission } from "@/routes/guard";
import { sceneBundleQuery } from "@/territory/application/scene-bundle-query";
import { HttpError } from "@/shared/infrastructure/http/http-error";
import PanoramaUploadForm from "@/panorama/presentation/components/panorama-upload-form";
import { titleMeta } from "@/shared/presentation/page-title";

function NewPanorama() {
  const { slug } = panoramaNewRoute.useParams();
  const { data: bundle } = useQuery(sceneBundleQuery(slug));
  if (!bundle) return null;
  const art = bundle.artifact;
  const sourceBbox = art?.bboxMin && art?.bboxMax ? { min: art.bboxMin, max: art.bboxMax } : null;
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#1c252f_0%,#0b0d10_38%,#060708_100%)] px-6 py-16 sm:px-10">
      <PanoramaUploadForm territorySlug={slug} territoryTitle={bundle.territory.title} sourceBbox={sourceBbox} />
    </main>
  );
}

export const panoramaNewRoute = createRoute({
  getParentRoute: () => authedLayoutRoute,
  path: "/territories/$slug/panoramas/new",
  head: ({ params }) => titleMeta(`New panorama · ${params.slug}`),
  beforeLoad: ({ context, location }) =>
    requirePermission(context.queryClient, location, "panorama:write"),
  loader: async ({ context, params }) => {
    try {
      await context.queryClient.ensureQueryData(sceneBundleQuery(params.slug));
    } catch (e) {
      if (e instanceof HttpError && e.status === 404) throw notFound();
      throw e;
    }
  },
  component: NewPanorama,
});
