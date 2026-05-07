import Link from "next/link";
import { listProjects } from "@/catalog/infrastructure/catalog-gateway";

// Force dynamic rendering — the catalog can change without redeploying.
export const dynamic = "force-dynamic";

export default async function Home() {
  const projects = await listProjects();

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#1c252f_0%,#0b0d10_38%,#060708_100%)] text-white">
      <section className="mx-auto flex min-h-screen w-full max-w-6xl flex-col justify-center px-6 py-16 sm:px-10">
        <div className="max-w-2xl">
          <p className="text-xs uppercase tracking-[0.36em] text-cyan-300/80">Rosneft Viewer</p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white sm:text-6xl">
            Выберите проект для просмотра 3D-модели
          </h1>
          <p className="mt-5 text-base leading-7 text-neutral-300 sm:text-lg">
            Главная страница стала точкой входа: отсюда можно открыть нужный проект и перейти в
            viewer. Каталог проектов теперь приходит из catalog-service.
          </p>
        </div>

        {projects.length === 0 ? (
          <div className="mt-12 rounded-3xl border border-white/10 bg-white/[0.03] p-8 text-neutral-300">
            Каталог пуст. Запусти сидер: <code className="rounded bg-black/40 px-2 py-1 text-cyan-200">catalog seed data/projects.yaml</code>.
          </div>
        ) : (
          <div className="mt-12 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {projects.map((project) => (
              <Link
                key={project.slug}
                href={`/projects/${project.slug}`}
                className="group rounded-3xl border border-white/10 bg-white/[0.03] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.35)] backdrop-blur transition duration-300 hover:border-cyan-300/50 hover:bg-white/[0.06]"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    {project.subtitle ? (
                      <p className="text-xs uppercase tracking-[0.24em] text-neutral-400">
                        {project.subtitle}
                      </p>
                    ) : null}
                    <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white">
                      {project.title}
                    </h2>
                  </div>
                  <span className="rounded-full border border-cyan-300/30 bg-cyan-300/10 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-cyan-200">
                    Open
                  </span>
                </div>

                {project.description ? (
                  <p className="mt-6 text-sm leading-6 text-neutral-300">{project.description}</p>
                ) : null}

                <div className="mt-8 flex items-center justify-between border-t border-white/10 pt-4 text-sm text-neutral-400">
                  <span>Slug: {project.slug}</span>
                  <span className="transition duration-300 group-hover:translate-x-1 group-hover:text-cyan-200">
                    Перейти
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
