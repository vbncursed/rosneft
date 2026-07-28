import { createRoute, notFound } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { authedLayoutRoute } from "@/routes/layout";
import { requirePermission } from "@/routes/guard";
import { sceneBundleQuery } from "@/territory/application/scene-bundle-query";
import { HttpError } from "@/shared/infrastructure/http/http-error";
import DocumentUploadForm from "@/document/presentation/components/document-upload-form";

function NewDocument() {
  const { slug } = documentNewRoute.useParams();
  const { data: bundle } = useQuery(sceneBundleQuery(slug));
  if (!bundle) return null;
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#1c252f_0%,#0b0d10_38%,#060708_100%)] px-6 py-16 sm:px-10">
      <DocumentUploadForm territorySlug={slug} territoryTitle={bundle.territory.title} />
    </main>
  );
}

export const documentNewRoute = createRoute({
  getParentRoute: () => authedLayoutRoute,
  path: "/territories/$slug/documents/new",
  beforeLoad: ({ context, location }) =>
    requirePermission(context.queryClient, location, "document:write"),
  loader: async ({ context, params }) => {
    try {
      await context.queryClient.ensureQueryData(sceneBundleQuery(params.slug));
    } catch (e) {
      if (e instanceof HttpError && e.status === 404) throw notFound();
      throw e;
    }
  },
  component: NewDocument,
});
