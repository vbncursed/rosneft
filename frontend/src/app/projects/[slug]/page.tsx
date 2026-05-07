import { notFound } from "next/navigation";
import ConversionPending from "@/conversion/presentation/conversion-pending";
import ViewerEntry from "@/viewer/presentation/components/viewer-entry";
import { getSceneBundle } from "@/catalog/infrastructure/catalog-gateway";
import { bboxAxis } from "@/catalog/domain/artifact";
import type { LodArtifact } from "@/catalog/domain/lod-artifact";
import { notFoundOnHttp404 } from "@/shared/infrastructure/http/not-found-on-404";
import type { Placement, ResolvedPlacement } from "@/placement/domain/placement";
import type { PlacementAssetOption } from "@/placement/domain/asset-option";
import type { ModelMetadata } from "@/viewer/domain/model-metadata";

interface ProjectPageProps {
  params: Promise<{ slug: string }>;
}

// Force dynamic rendering — every page load fetches fresh project + artifact
// + placement state from the catalog. We do not pre-render, since the
// catalog can grow without redeploys.
export const dynamic = "force-dynamic";

function resolvePlacements(
  placements: Placement[],
  options: PlacementAssetOption[],
): ResolvedPlacement[] {
  // assetOptions already carries the LOD chain per asset — join by slug
  // so each placement gets the chain it needs without extra catalog calls.
  const lodsBySlug = new Map(options.map((o) => [o.slug, o.lods]));
  return placements.map((p) => ({
    ...p,
    lods: lodsBySlug.get(p.assetSlug) ?? [],
  }));
}

export default async function ProjectPage({ params }: ProjectPageProps) {
  const { slug } = await params;

  const bundle = await getSceneBundle(slug).catch(notFoundOnHttp404(null));
  if (!bundle) notFound();

  const { project, artifact, placements, assetOptions } = bundle;
  if (!artifact) {
    return <ConversionPending title={project.title} slug={slug} />;
  }

  // The /scene endpoint populates artifact.lods with the parent's full
  // chain. Fall back to a single-entry chain built from the top-level
  // hash if it's missing for any reason — keeps rendering reliable
  // against partial backend responses.
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
    name: project.title,
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
        title={project.title}
        metadata={metadata}
        parentSlug={slug}
        initialPlacements={resolvePlacements(placements, assetOptions)}
        assetOptions={assetOptions}
      />
    </main>
  );
}
