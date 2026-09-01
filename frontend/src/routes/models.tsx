import { createRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { authedLayoutRoute } from "@/routes/layout";
import { modelsQuery } from "@/model/application/models-query";
import { useCurrentUser } from "@/auth/presentation/current-user-context";
import { can } from "@/auth/domain/principal";
import { MotionList, MotionItem } from "@/shared/presentation/motion";
import CatalogCard from "@/shared/presentation/catalog/catalog-card";
import DeleteModelButton from "@/model/presentation/delete-model-button";
import { titleMeta } from "@/shared/presentation/page-title";

function Models() {
  const me = useCurrentUser();
  const { data: models = [] } = useQuery(modelsQuery);
  const canWrite = can(me, "model:write");
  const canDelete = can(me, "model:delete");

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#2a1f10_0%,#0b0d10_38%,#060708_100%)] text-white">
      <section className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 py-16 sm:px-10">
        <header className="flex items-end justify-between gap-4">
          <div>
            <Link to="/" className="text-[10px] uppercase tracking-[0.28em] text-neutral-400 transition-colors hover:text-white">← Home</Link>
            <p className="mt-3 text-xs uppercase tracking-[0.36em] text-amber-200/80">Model catalog</p>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white sm:text-5xl">Models for placement</h1>
          </div>
          {canWrite ? <Link to="/models/new" className="cursor-pointer rounded-full bg-white px-5 py-2.5 text-xs uppercase tracking-[0.2em] text-black transition-colors hover:bg-amber-200">+ Upload</Link> : null}
        </header>
        {models.length === 0 ? (
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-8 text-neutral-300">No models yet. Upload your first one.</div>
        ) : (
          <MotionList className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {models.map((m) => (
              <MotionItem key={m.slug} className="relative">
                {canDelete ? <div className="absolute right-3 top-3 z-10"><DeleteModelButton slug={m.slug} label={m.title} /></div> : null}
                <Link to="/models/$slug" params={{ slug: m.slug }} className="block cursor-pointer">
                  <CatalogCard title={m.title} description={m.description} slug={m.slug} showOpen={false} />
                </Link>
              </MotionItem>
            ))}
          </MotionList>
        )}
      </section>
    </main>
  );
}

export const modelsRoute = createRoute({
  getParentRoute: () => authedLayoutRoute,
  path: "/models",
  head: () => titleMeta("Models"),
  loader: ({ context }) => context.queryClient.ensureQueryData(modelsQuery),
  component: Models,
});
