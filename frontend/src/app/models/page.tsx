import Link from "next/link";
import { listModels } from "@/model/infrastructure/model-gateway";

export const dynamic = "force-dynamic";

export default async function ModelsPage() {
  const models = await listModels();

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#2a1f10_0%,#0b0d10_38%,#060708_100%)] text-white">
      <section className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 py-16 sm:px-10">
        <header className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.36em] text-amber-200/80">
              Каталог моделей
            </p>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white sm:text-5xl">
              Модели для размещения
            </h1>
          </div>
          <Link
            href="/models/new"
            className="cursor-pointer rounded-full bg-white px-5 py-2.5 text-xs uppercase tracking-[0.2em] text-black transition-colors duration-200 hover:bg-amber-200"
          >
            + Загрузить
          </Link>
        </header>

        {models.length === 0 ? (
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-8 text-neutral-300">
            Моделей пока нет. Загрузите первую.
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {models.map((m) => (
              <article
                key={m.slug}
                className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur"
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
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
