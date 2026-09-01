import { createRoute, notFound } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { authedLayoutRoute } from "@/routes/layout";
import { requirePermission } from "@/routes/guard";
import { sceneBundleQuery } from "@/territory/application/scene-bundle-query";
import { HttpError } from "@/shared/infrastructure/http/http-error";
import ReplaceSourceForm from "@/territory/presentation/components/replace-source-form";
import { titleMeta } from "@/shared/presentation/page-title";

function ReplaceTerritory() {
  const { slug } = territoryReplaceRoute.useParams();
  const { data: bundle } = useQuery(sceneBundleQuery(slug));
  if (!bundle) return null;
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#1c252f_0%,#0b0d10_38%,#060708_100%)] px-6 py-16 sm:px-10">
      <ReplaceSourceForm slug={slug} title={bundle.territory.title} />
    </main>
  );
}

export const territoryReplaceRoute = createRoute({
  getParentRoute: () => authedLayoutRoute,
  path: "/territories/$slug/replace",
  head: ({ params }) => titleMeta(`Replace source · ${params.slug}`),
  beforeLoad: ({ context, location }) =>
    requirePermission(context.queryClient, location, "territory:write"),
  loader: async ({ context, params }) => {
    try {
      await context.queryClient.ensureQueryData(sceneBundleQuery(params.slug));
    } catch (e) {
      if (e instanceof HttpError && e.status === 404) throw notFound();
      throw e;
    }
  },
  component: ReplaceTerritory,
});
