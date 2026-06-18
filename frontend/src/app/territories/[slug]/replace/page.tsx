import { notFound } from "next/navigation";
import ReplaceSourceForm from "@/territory/presentation/components/replace-source-form";
import { getTerritory } from "@/territory/infrastructure/territory-gateway";
import { notFoundOnHttp404 } from "@/shared/infrastructure/http/not-found-on-404";

interface ReplaceTerritoryPageProps {
  params: Promise<{ slug: string }>;
}

export const dynamic = "force-dynamic";

export default async function ReplaceTerritoryPage({
  params,
}: ReplaceTerritoryPageProps) {
  const { slug } = await params;
  const territory = await getTerritory(slug).catch(notFoundOnHttp404(null));
  if (!territory) notFound();

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#1c252f_0%,#0b0d10_38%,#060708_100%)] px-6 py-16 sm:px-10">
      <ReplaceSourceForm slug={slug} title={territory.title} />
    </main>
  );
}
