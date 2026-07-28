import { createRoute } from "@tanstack/react-router";
import { authedLayoutRoute } from "@/routes/layout";
import { requirePermission } from "@/routes/guard";
import UploadForm from "@/upload/presentation/components/upload-form";
import { createTerritory } from "@/territory/infrastructure/territory-gateway";

function NewTerritory() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#1c252f_0%,#0b0d10_38%,#060708_100%)] px-6 py-16 sm:px-10">
      <UploadForm
        kind="Territory"
        redirectBase="/territories"
        redirectAfter="detail"
        showPanoramaUrl
        create={async (body) => {
          const { territory, job } = await createTerritory(body);
          return { slug: territory.slug, job };
        }}
      />
    </main>
  );
}

export const territoryNewRoute = createRoute({
  getParentRoute: () => authedLayoutRoute,
  path: "/territories/new",
  beforeLoad: ({ context, location }) =>
    requirePermission(context.queryClient, location, "territory:write"),
  component: NewTerritory,
});
