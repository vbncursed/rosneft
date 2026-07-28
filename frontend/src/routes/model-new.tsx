import { createRoute } from "@tanstack/react-router";
import { authedLayoutRoute } from "@/routes/layout";
import { requirePermission } from "@/routes/guard";
import BatchUploadForm from "@/upload/presentation/components/batch-upload-form";
import { createModel } from "@/model/infrastructure/model-gateway";

function NewModel() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#2a1f10_0%,#0b0d10_38%,#060708_100%)] px-6 py-16 sm:px-10">
      <BatchUploadForm
        kind="Model"
        redirectBase="/models"
        create={async (body) => {
          const { model, job } = await createModel(body);
          return { slug: model.slug, job };
        }}
      />
    </main>
  );
}

export const modelNewRoute = createRoute({
  getParentRoute: () => authedLayoutRoute,
  path: "/models/new",
  beforeLoad: ({ context, location }) =>
    requirePermission(context.queryClient, location, "model:write"),
  component: NewModel,
});
