import Link from "next/link";
import { MotionList, MotionItem } from "@/shared/presentation/motion";
import { listTerritories } from "@/territory/infrastructure/territory-gateway";
import { listModels } from "@/model/infrastructure/model-gateway";
import DeleteTerritoryButton from "@/app/_components/delete-territory-button";
import DeleteModelButton from "@/app/_components/delete-model-button";
import ReplaceSourceButton from "@/app/_components/replace-source-button";
import { getCurrentUser } from "@/auth/application/current-user";
import { can } from "@/auth/domain/principal";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [territories, models, me] = await Promise.all([
    listTerritories(),
    listModels(),
    getCurrentUser(),
  ]);
  const territoryWrite = can(me, "territory:write");
  const territoryDelete = can(me, "territory:delete");
  const modelWrite = can(me, "model:write");
  const modelDelete = can(me, "model:delete");

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#1c252f_0%,#0b0d10_38%,#060708_100%)] text-white">
      <section className="mx-auto flex w-full max-w-6xl flex-col gap-16 px-6 py-16 sm:px-10">
        <header>
          <p className="text-xs uppercase tracking-[0.36em] text-cyan-300/80">
            Andrey Viewer
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white sm:text-6xl">
            Territories and models
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-neutral-300 sm:text-lg">
            A territory is the scene you walk through in the viewer. A model is
            an asset placed on top of it. Upload sources as a ZIP and
            mesh-worker converts them into a GLB LOD chain.
          </p>
        </header>

        <Section
          title="Territories"
          newHref={territoryWrite ? "/territories/new" : undefined}
          newLabel="Upload territory"
          empty="The catalog is empty."
          items={territories}
          itemHref={(t) => `/territories/${t.slug}`}
          renderDelete={(item) =>
            territoryWrite || territoryDelete ? (
              <div className="flex items-center gap-2">
                {territoryWrite ? <ReplaceSourceButton slug={item.slug} /> : null}
                {territoryDelete ? <DeleteTerritoryButton slug={item.slug} label={item.title} /> : null}
              </div>
            ) : null
          }
        />

        <Section
          title="Models"
          newHref={modelWrite ? "/models/new" : undefined}
          newLabel="Upload model"
          empty="No models yet."
          items={models}
          itemHref={(m) => `/models/${m.slug}`}
          renderDelete={(item) =>
            modelDelete ? <DeleteModelButton slug={item.slug} label={item.title} /> : null
          }
        />
      </section>
    </main>
  );
}

interface CatalogItem {
  slug: string;
  title: string;
  description?: string;
}

interface SectionProps {
  title: string;
  newHref?: string;
  newLabel: string;
  empty: string;
  items: CatalogItem[];
  itemHref: (item: CatalogItem) => string | null;
  renderDelete?: (item: CatalogItem) => React.ReactNode;
}

function Section({
  title,
  newHref,
  newLabel,
  empty,
  items,
  itemHref,
  renderDelete,
}: SectionProps) {
  return (
    <section>
      <div className="flex items-end justify-between gap-4">
        <h2 className="text-2xl font-semibold tracking-tight text-white">{title}</h2>
        {newHref ? (
          <Link
            href={newHref}
            className="cursor-pointer rounded-full border border-white/20 bg-white/[0.04] px-4 py-2 text-xs uppercase tracking-[0.2em] text-white transition-colors duration-200 hover:bg-white/[0.1]"
          >
            + {newLabel}
          </Link>
        ) : null}
      </div>

      {items.length === 0 ? (
        <div className="mt-6 rounded-3xl border border-white/10 bg-white/[0.03] p-8 text-neutral-300">
          {empty}
        </div>
      ) : (
        <MotionList className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => {
            const href = itemHref(item);
            const Card = (
              <article className="group h-full rounded-3xl border border-white/10 bg-white/[0.03] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.35)] backdrop-blur transition duration-300 hover:border-white/30 hover:bg-white/[0.06]">
                <h3 className="pr-36 text-2xl font-semibold tracking-tight text-white">
                  {item.title}
                </h3>
                {item.description ? (
                  <p className="mt-6 line-clamp-3 text-sm leading-6 text-neutral-300">
                    {item.description}
                  </p>
                ) : null}
                <div className="mt-8 flex items-center justify-between border-t border-white/10 pt-4 text-sm text-neutral-400">
                  <span>{item.slug}</span>
                  {href ? (
                    <span className="transition duration-300 group-hover:translate-x-1 group-hover:text-white">
                      Open
                    </span>
                  ) : null}
                </div>
              </article>
            );
            return (
              <MotionItem key={item.slug} className="relative">
                {href ? (
                  <Link href={href} className="cursor-pointer">
                    {Card}
                  </Link>
                ) : (
                  Card
                )}
                {renderDelete ? (
                  <div className="absolute right-3 top-3 z-10">
                    {renderDelete(item)}
                  </div>
                ) : null}
              </MotionItem>
            );
          })}
        </MotionList>
      )}
    </section>
  );
}
