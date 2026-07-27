import { createRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { authedLayoutRoute } from "@/routes/layout";
import { territoriesQuery } from "@/territory/application/territories-query";
import { useCurrentUser } from "@/auth/presentation/current-user-context";
import { can } from "@/auth/domain/principal";
import { MotionList, MotionItem } from "@/shared/presentation/motion";
import CatalogCard from "@/shared/presentation/catalog/catalog-card";
import DeleteTerritoryButton from "@/territory/presentation/delete-territory-button";
import ReplaceSourceButton from "@/territory/presentation/replace-source-button";

function Territories() {
  const me = useCurrentUser();
  const { data: territories = [] } = useQuery(territoriesQuery);
  const canWrite = can(me, "territory:write");
  const canDelete = can(me, "territory:delete");

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#1c252f_0%,#0b0d10_38%,#060708_100%)] text-white">
      <section className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 py-16 sm:px-10">
        <header className="flex items-end justify-between gap-4">
          <div>
            <Link to="/" className="text-[10px] uppercase tracking-[0.28em] text-neutral-400 transition-colors hover:text-white">← Home</Link>
            <p className="mt-3 text-xs uppercase tracking-[0.36em] text-cyan-300/80">Territory catalog</p>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white sm:text-5xl">Scenes to walk through</h1>
          </div>
          {canWrite ? <a href="/territories/new" className="cursor-pointer rounded-full bg-white px-5 py-2.5 text-xs uppercase tracking-[0.2em] text-black transition-colors hover:bg-cyan-200">+ Upload</a> : null}
        </header>
        {territories.length === 0 ? (
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-8 text-neutral-300">The catalog is empty. Upload your first territory.</div>
        ) : (
          <MotionList className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {territories.map((t) => (
              <MotionItem key={t.slug} className="relative">
                {canWrite || canDelete ? (
                  <div className="absolute right-3 top-3 z-10 flex items-center gap-2">
                    {canWrite ? <ReplaceSourceButton slug={t.slug} /> : null}
                    {canDelete ? <DeleteTerritoryButton slug={t.slug} label={t.title} /> : null}
                  </div>
                ) : null}
                <Link to="/territories/$slug" params={{ slug: t.slug }} className="block cursor-pointer">
                  <CatalogCard title={t.title} description={t.description} slug={t.slug} showOpen={false} />
                </Link>
              </MotionItem>
            ))}
          </MotionList>
        )}
      </section>
    </main>
  );
}

export const territoriesRoute = createRoute({
  getParentRoute: () => authedLayoutRoute,
  path: "/territories",
  loader: ({ context }) => context.queryClient.ensureQueryData(territoriesQuery),
  component: Territories,
});
