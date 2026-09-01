import { createRoute, notFound, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { authedLayoutRoute } from "@/routes/layout";
import { modelQuery, modelArtifactsQuery } from "@/model/application/model-detail-queries";
import { HttpError } from "@/shared/infrastructure/http/http-error";
import { useCurrentUser } from "@/auth/presentation/current-user-context";
import { can } from "@/auth/domain/principal";
import ConversionPending from "@/conversion/presentation/conversion-pending";
import DeleteModelButton from "@/model/presentation/delete-model-button";
import ModelThumbnailEditor from "@/model/presentation/model-thumbnail-editor";
import { titleMeta } from "@/shared/presentation/page-title";

function ModelDetail() {
  const { slug } = modelDetailRoute.useParams();
  const { jobId } = modelDetailRoute.useSearch();
  const me = useCurrentUser();
  const { data: model } = useQuery(modelQuery(slug));
  const { data: artifacts = [] } = useQuery(modelArtifactsQuery(slug));
  if (!model) return null;

  const lod0 = artifacts.find((a) => a.lod === 0);
  if (!lod0) {
    return <ConversionPending title={model.title} slug={slug} jobId={jobId ?? null} kind="model" />;
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#2a1f10_0%,#0b0d10_38%,#060708_100%)] px-6 py-16 text-white sm:px-10">
      <Link to="/" className="mx-auto mb-6 block w-full max-w-2xl text-xs uppercase tracking-[0.2em] text-neutral-400 transition-colors duration-200 hover:text-white">
        ← Catalog
      </Link>
      <article className="mx-auto max-w-2xl space-y-6 rounded-3xl border border-white/10 bg-white/[0.03] p-8 backdrop-blur">
        <div className="flex items-start justify-between gap-4">
          <p className="text-xs uppercase tracking-[0.36em] text-amber-200/80">Model</p>
          {can(me, "model:delete") ? <DeleteModelButton slug={slug} label={model.title} redirectTo="/" /> : null}
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-white">{model.title}</h1>
        {model.description ? <p className="text-sm leading-6 text-neutral-300">{model.description}</p> : null}
        <ModelThumbnailEditor slug={slug} thumbnailBlobHash={model.thumbnailBlobHash} canWrite={can(me, "model:write")} />
        <dl className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-[11px] uppercase tracking-[0.2em] text-neutral-500">Slug</dt>
            <dd className="mt-1 font-mono text-neutral-200">{model.slug}</dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-[0.2em] text-neutral-500">LODs</dt>
            <dd className="mt-1 font-mono text-neutral-200">{artifacts.length}</dd>
          </div>
        </dl>
        <p className="text-sm leading-6 text-neutral-300">
          The model is ready — drop it onto any territory via the placement panel. Open the{" "}
          <Link to="/" className="text-cyan-300 underline">catalog</Link>{" "}and pick a territory.
        </p>
      </article>
    </main>
  );
}

export const modelDetailRoute = createRoute({
  getParentRoute: () => authedLayoutRoute,
  path: "/models/$slug",
  head: ({ params }) => titleMeta(params.slug),
  validateSearch: (s: Record<string, unknown>): { jobId?: string } => ({
    jobId: typeof s.jobId === "string" ? s.jobId : undefined,
  }),
  loader: async ({ context, params }) => {
    try {
      await context.queryClient.ensureQueryData(modelQuery(params.slug));
    } catch (e) {
      if (e instanceof HttpError && e.status === 404) throw notFound();
      throw e;
    }
    await context.queryClient.ensureQueryData(modelArtifactsQuery(params.slug));
  },
  component: ModelDetail,
});
