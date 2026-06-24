import Link from "next/link";
import { notFound } from "next/navigation";
import { getModel, listModelArtifacts } from "@/model/infrastructure/model-gateway";
import ConversionPending from "@/conversion/presentation/conversion-pending";
import { notFoundOnHttp404 } from "@/shared/infrastructure/http/not-found-on-404";
import DeleteModelButton from "@/app/_components/delete-model-button";
import { getCurrentUser } from "@/auth/application/current-user";
import { can } from "@/auth/domain/principal";

interface ModelPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ jobId?: string }>;
}

export const dynamic = "force-dynamic";

export default async function ModelPage({ params, searchParams }: ModelPageProps) {
  const { slug } = await params;
  const { jobId } = await searchParams;

  const model = await getModel(slug).catch(notFoundOnHttp404(null));
  if (!model) notFound();

  const artifacts = await listModelArtifacts(slug).catch(() => []);

  // No LOD0 yet → conversion still running OR it failed. Use the
  // pending screen so we can show progress + final error message.
  const lod0 = artifacts.find((a) => a.lod === 0);
  if (!lod0) {
    return <ConversionPending title={model.title} slug={slug} jobId={jobId ?? null} />;
  }

  const canDelete = can(await getCurrentUser(), "model:delete");

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#2a1f10_0%,#0b0d10_38%,#060708_100%)] px-6 py-16 text-white sm:px-10">
      <Link
        href="/"
        className="mx-auto mb-6 block w-full max-w-2xl text-xs uppercase tracking-[0.2em] text-neutral-400 transition-colors duration-200 hover:text-white"
      >
        ← Catalog
      </Link>
      <article className="mx-auto max-w-2xl space-y-6 rounded-3xl border border-white/10 bg-white/[0.03] p-8 backdrop-blur">
        <div className="flex items-start justify-between gap-4">
          <p className="text-xs uppercase tracking-[0.36em] text-amber-200/80">Model</p>
          {canDelete ? <DeleteModelButton slug={slug} label={model.title} redirectTo="/" /> : null}
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-white">{model.title}</h1>
        {model.description ? (
          <p className="text-sm leading-6 text-neutral-300">{model.description}</p>
        ) : null}
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
          The model is ready — drop it onto any territory via the placement
          panel. Open the{" "}
          <Link href="/" className="text-cyan-300 underline">catalog</Link>{" "}and pick a territory.
        </p>
      </article>
    </main>
  );
}
