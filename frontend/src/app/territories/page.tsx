import Link from "next/link";
import { listTerritories } from "@/territory/infrastructure/territory-gateway";
import DeleteTerritoryButton from "@/app/_components/delete-territory-button";
import ReplaceSourceButton from "@/app/_components/replace-source-button";
import AssignAdminsButton from "@/app/_components/assign-admins-button";
import { getCurrentUser } from "@/auth/application/current-user";
import { can } from "@/auth/domain/principal";

export const dynamic = "force-dynamic";

export default async function TerritoriesPage() {
  const [territories, me] = await Promise.all([listTerritories(), getCurrentUser()]);
  const canWrite = can(me, "territory:write");
  const canDelete = can(me, "territory:delete");
  const isRoot = me?.isOwner ?? false;

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#1c252f_0%,#0b0d10_38%,#060708_100%)] text-white">
      <section className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 py-16 sm:px-10">
        <header className="flex items-end justify-between gap-4">
          <div>
            <Link
              href="/"
              className="text-[10px] uppercase tracking-[0.28em] text-neutral-400 transition-colors hover:text-white"
            >
              ← Home
            </Link>
            <p className="mt-3 text-xs uppercase tracking-[0.36em] text-cyan-300/80">
              Territory catalog
            </p>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white sm:text-5xl">
              Scenes to walk through
            </h1>
          </div>
          {canWrite ? (
            <Link
              href="/territories/new"
              className="cursor-pointer rounded-full bg-white px-5 py-2.5 text-xs uppercase tracking-[0.2em] text-black transition-colors duration-200 hover:bg-cyan-200"
            >
              + Upload
            </Link>
          ) : null}
        </header>

        {territories.length === 0 ? (
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-8 text-neutral-300">
            The catalog is empty. Upload your first territory.
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {territories.map((t) => (
              <article
                key={t.slug}
                className="relative rounded-3xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur"
              >
                {canWrite || canDelete || isRoot ? (
                  <div className="absolute right-3 top-3 z-10 flex items-center gap-2">
                    {isRoot ? <AssignAdminsButton slug={t.slug} label={t.title} /> : null}
                    {canWrite ? <ReplaceSourceButton slug={t.slug} /> : null}
                    {canDelete ? <DeleteTerritoryButton slug={t.slug} label={t.title} /> : null}
                  </div>
                ) : null}
                <Link href={`/territories/${t.slug}`} className="block cursor-pointer">
                  <h2 className="pr-36 text-2xl font-semibold tracking-tight text-white">
                    {t.title}
                  </h2>
                  {t.description ? (
                    <p className="mt-4 line-clamp-3 text-sm leading-6 text-neutral-300">
                      {t.description}
                    </p>
                  ) : null}
                  <p className="mt-6 text-xs text-neutral-500">{t.slug}</p>
                </Link>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
