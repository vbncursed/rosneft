"use client";

import UploadForm from "@/upload/presentation/components/upload-form";
import { createModel } from "@/model/infrastructure/model-gateway";

export default function NewModelPage() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#2a1f10_0%,#0b0d10_38%,#060708_100%)] px-6 py-16 sm:px-10">
      <UploadForm
        kind="Модель"
        redirectBase="/models"
        redirectAfter="list"
        create={async (body) => {
          const { model, job } = await createModel(body);
          return { slug: model.slug, job };
        }}
      />
    </main>
  );
}
