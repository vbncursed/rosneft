import { notFound } from "next/navigation";
import DocumentUploadForm from "@/document/presentation/components/document-upload-form";
import { getSceneBundle } from "@/territory/infrastructure/territory-gateway";
import { notFoundOnHttp404 } from "@/shared/infrastructure/http/not-found-on-404";
import { requirePermission } from "@/auth/application/require-permission";

interface NewDocumentPageProps {
  params: Promise<{ slug: string }>;
}

export const dynamic = "force-dynamic";

export default async function NewDocumentPage({ params }: NewDocumentPageProps) {
  const { slug } = await params;
  await requirePermission("document:write");
  const bundle = await getSceneBundle(slug).catch(notFoundOnHttp404(null));
  if (!bundle) notFound();

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#1c252f_0%,#0b0d10_38%,#060708_100%)] px-6 py-16 sm:px-10">
      <DocumentUploadForm territorySlug={slug} territoryTitle={bundle.territory.title} />
    </main>
  );
}
