import Link from "next/link";
import { MotionList, MotionItem } from "@/shared/presentation/motion";
import { listModels } from "@/model/infrastructure/model-gateway";
import DeleteModelButton from "@/app/_components/delete-model-button";
import { getCurrentUser } from "@/auth/application/current-user";
import { can } from "@/auth/domain/principal";

export const dynamic = "force-dynamic";

export default async function ModelsPage() {
  const [models, me] = await Promise.all([listModels(), getCurrentUser()]);
  const canWrite = can(me, "model:write");
  const canDelete = can(me, "model:delete");

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#2a1f10_0%,#0b0d10_38%,#060708_100%)] text-white">
      <section className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 py-16 sm:px-10">
        <header className="flex items-end justify-between gap-4">
          <div>
            <Link
              href="/"
              className="text-[10px] uppercase tracking-[0.28em] text-neutral-400 transition-colors hover:text-white"
            >
              ← Home
            </Link>
            <p className="mt-3 text-xs uppercase tracking-[0.36em] text-amber-200/80">
              Model catalog
            </p>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white sm:text-5xl">
              Models for placement
            </h1>
          </div>
          {canWrite ? (
            <Link
              href="/models/new"
              className="cursor-pointer rounded-full bg-white px-5 py-2.5 text-xs uppercase tracking-[0.2em] text-black transition-colors duration-200 hover:bg-amber-200"
            >
              + Upload
            </Link>
          ) : null}
        </header>

        {models.length === 0 ? (
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-8 text-neutral-300">
            No models yet. Upload your first one.
          </div>
        ) : (
          <MotionList className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {models.map((m) => (
              <MotionItem key={m.slug} className="relative rounded-3xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur">
                {canDelete ? (
                  <div className="absolute right-3 top-3 z-10">
                    <DeleteModelButton slug={m.slug} label={m.title} />
                  </div>
                ) : null}
                <Link
                  href={`/models/${m.slug}`}
                  className="block cursor-pointer"
                >
                  <h2 className="text-2xl font-semibold tracking-tight text-white">
                    {m.title}
                  </h2>
                  {m.description ? (
                    <p className="mt-4 line-clamp-3 text-sm leading-6 text-neutral-300">
                      {m.description}
                    </p>
                  ) : null}
                  <p className="mt-6 text-xs text-neutral-500">{m.slug}</p>
                </Link>
              </MotionItem>
            ))}
          </MotionList>
        )}
      </section>
    </main>
  );
}
