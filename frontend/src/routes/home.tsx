import { createRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { authedLayoutRoute } from "@/routes/layout";
import { territoriesQuery } from "@/territory/application/territories-query";
import { modelsQuery } from "@/model/application/models-query";
import { useCurrentUser } from "@/auth/presentation/current-user-context";
import { can } from "@/auth/domain/principal";
import { MotionList, MotionItem } from "@/shared/presentation/motion";
import CatalogCard from "@/shared/presentation/catalog/catalog-card";
import { preloadModelViewer } from "@/viewer/presentation/components/viewer-entry";
import DeleteTerritoryButton from "@/territory/presentation/delete-territory-button";
import ReplaceSourceButton from "@/territory/presentation/replace-source-button";
import DeleteModelButton from "@/model/presentation/delete-model-button";

const newLink =
  "cursor-pointer rounded-full border border-white/20 bg-white/[0.04] px-4 py-2 text-xs uppercase tracking-[0.2em] text-white transition-colors hover:bg-white/[0.1]";
const emptyBox = "mt-6 rounded-3xl border border-white/10 bg-white/[0.03] p-8 text-neutral-300";
const grid = "mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-3";

function Home() {
  // Warm the viewer chunk while the catalog is being read: without it the first
  // territory opened swaps this page for the viewer's Suspense fallback until
  // ~1.2 MB of three/R3F arrives.
  useEffect(preloadModelViewer, []);

  const me = useCurrentUser();
  const { data: territories = [] } = useQuery(territoriesQuery);
  const { data: models = [] } = useQuery(modelsQuery);
  const tWrite = can(me, "territory:write");
  const tDelete = can(me, "territory:delete");
  const mWrite = can(me, "model:write");
  const mDelete = can(me, "model:delete");

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#1c252f_0%,#0b0d10_38%,#060708_100%)] text-white">
      <section className="mx-auto flex w-full max-w-6xl flex-col gap-16 px-6 py-16 sm:px-10">
        <header>
          <p className="text-xs uppercase tracking-[0.36em] text-cyan-300/80">Andrey Viewer</p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white sm:text-6xl">
            Territories and models
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-neutral-300 sm:text-lg">
            A territory is the scene you walk through in the viewer. A model is an asset placed on top of it.
          </p>
        </header>

        <section>
          <div className="flex items-end justify-between gap-4">
            <h2 className="text-2xl font-semibold tracking-tight text-white">Territories</h2>
            {tWrite ? <Link to="/territories/new" className={newLink}>+ Upload territory</Link> : null}
          </div>
          {territories.length === 0 ? (
            <div className={emptyBox}>The catalog is empty.</div>
          ) : (
            <MotionList className={grid}>
              {territories.map((t) => (
                <MotionItem key={t.slug} className="relative">
                  <Link to="/territories/$slug" params={{ slug: t.slug }} className="cursor-pointer">
                    <CatalogCard title={t.title} description={t.description} slug={t.slug} />
                  </Link>
                  {tWrite || tDelete ? (
                    <div className="absolute right-3 top-3 z-10 flex items-center gap-2">
                      {tWrite ? <ReplaceSourceButton slug={t.slug} /> : null}
                      {tDelete ? <DeleteTerritoryButton slug={t.slug} label={t.title} /> : null}
                    </div>
                  ) : null}
                </MotionItem>
              ))}
            </MotionList>
          )}
        </section>

        <section>
          <div className="flex items-end justify-between gap-4">
            <h2 className="text-2xl font-semibold tracking-tight text-white">Models</h2>
            {mWrite ? <Link to="/models/new" className={newLink}>+ Upload model</Link> : null}
          </div>
          {models.length === 0 ? (
            <div className={emptyBox}>No models yet.</div>
          ) : (
            <MotionList className={grid}>
              {models.map((m) => (
                <MotionItem key={m.slug} className="relative">
                  <Link to="/models/$slug" params={{ slug: m.slug }} className="cursor-pointer">
                    <CatalogCard title={m.title} description={m.description} slug={m.slug} />
                  </Link>
                  {mDelete ? (
                    <div className="absolute right-3 top-3 z-10">
                      <DeleteModelButton slug={m.slug} label={m.title} />
                    </div>
                  ) : null}
                </MotionItem>
              ))}
            </MotionList>
          )}
        </section>
      </section>
    </main>
  );
}

export const homeRoute = createRoute({
  getParentRoute: () => authedLayoutRoute,
  path: "/",
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(territoriesQuery),
      context.queryClient.ensureQueryData(modelsQuery),
    ]),
  component: Home,
});
