"use client";

import UploadForm from "@/upload/presentation/components/upload-form";
import { createTerritory } from "@/territory/infrastructure/territory-gateway";

export default function NewTerritoryPage() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#1c252f_0%,#0b0d10_38%,#060708_100%)] px-6 py-16 sm:px-10">
      <UploadForm
        kind="Territory"
        redirectBase="/territories"
        redirectAfter="detail"
        create={async (body) => {
          const { territory, job } = await createTerritory(body);
          return { slug: territory.slug, job };
        }}
      />
    </main>
  );
}
