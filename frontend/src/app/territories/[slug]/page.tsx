import { notFound } from "next/navigation";
import ConversionPending from "@/conversion/presentation/conversion-pending";
import ViewerEntry from "@/viewer/presentation/components/viewer-entry";
import { getSceneBundle } from "@/territory/infrastructure/territory-gateway";
import { bboxAxis } from "@/shared/domain/artifact";
import type { LodArtifact } from "@/shared/domain/lod-artifact";
import { notFoundOnHttp404 } from "@/shared/infrastructure/http/not-found-on-404";
import type { Placement, ResolvedPlacement } from "@/placement/domain/placement";
import type { PlacementAssetOption } from "@/placement/domain/asset-option";
import type { ModelMetadata } from "@/viewer/domain/model-metadata";

interface TerritoryPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ jobId?: string }>;
}

export const dynamic = "force-dynamic";

function resolvePlacements(
  placements: Placement[],
  options: PlacementAssetOption[],
): ResolvedPlacement[] {
  const lodsBySlug = new Map(options.map((o) => [o.slug, o.lods]));
  return placements.map((p) => ({
    ...p,
    lods: lodsBySlug.get(p.modelSlug) ?? [],
  }));
}

export default async function TerritoryPage({
  params,
  searchParams,
}: TerritoryPageProps) {
  const { slug } = await params;
  const { jobId } = await searchParams;

  const bundle = await getSceneBundle(slug).catch(notFoundOnHttp404(null));
  if (!bundle) notFound();

  const { territory, artifact, placements, modelOptions, panoramas, documents } = bundle;
  if (!artifact) {
    return (
      <ConversionPending title={territory.title} slug={slug} jobId={jobId ?? null} />
    );
  }

  const parentLods: LodArtifact[] = artifact.lods ?? [
    {
      lod: artifact.lod,
      hash: artifact.hash,
      size: artifact.size,
      vertices: artifact.vertices,
      faces: artifact.faces,
    },
  ];

  const metadata: ModelMetadata = {
    name: territory.title,
    vertices: artifact.vertices ?? 0,
    faces: artifact.faces ?? 0,
    dimensions: {
      x: bboxAxis(artifact.bboxMin?.x, artifact.bboxMax?.x),
      y: bboxAxis(artifact.bboxMin?.y, artifact.bboxMax?.y),
      z: bboxAxis(artifact.bboxMin?.z, artifact.bboxMax?.z),
    },
  };

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-black">
      <ViewerEntry
        parentLods={parentLods}
        title={territory.title}
        metadata={metadata}
        territorySlug={slug}
        initialPlacements={resolvePlacements(placements, modelOptions)}
        modelOptions={modelOptions}
        panoramas={panoramas}
        documents={documents}
        externalPanoramaUrl={territory.externalPanoramaUrl}
      />
    </main>
  );
}
