import { notFound } from "next/navigation";
import PanoramaUploadForm from "@/panorama/presentation/components/panorama-upload-form";
import { getSceneBundle } from "@/territory/infrastructure/territory-gateway";
import { notFoundOnHttp404 } from "@/shared/infrastructure/http/not-found-on-404";
import { requirePermission } from "@/auth/application/require-permission";

interface NewPanoramaPageProps {
  params: Promise<{ slug: string }>;
}

export const dynamic = "force-dynamic";

export default async function NewPanoramaPage({ params }: NewPanoramaPageProps) {
  const { slug } = await params;
  await requirePermission("panorama:write");
  const bundle = await getSceneBundle(slug).catch(notFoundOnHttp404(null));
  if (!bundle) notFound();

  // Source bbox drives GPS auto-placement; absent until LOD0 is converted.
  const art = bundle.artifact;
  const sourceBbox =
    art?.bboxMin && art?.bboxMax
      ? { min: art.bboxMin, max: art.bboxMax }
      : null;

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#1c252f_0%,#0b0d10_38%,#060708_100%)] px-6 py-16 sm:px-10">
      <PanoramaUploadForm
        territorySlug={slug}
        territoryTitle={bundle.territory.title}
        sourceBbox={sourceBbox}
      />
    </main>
  );
}
