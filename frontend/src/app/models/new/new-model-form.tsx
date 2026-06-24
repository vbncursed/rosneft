"use client";

import BatchUploadForm from "@/upload/presentation/components/batch-upload-form";
import { createModel } from "@/model/infrastructure/model-gateway";

export default function NewModelForm() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#2a1f10_0%,#0b0d10_38%,#060708_100%)] px-6 py-16 sm:px-10">
      <BatchUploadForm
        kind="Model"
        redirectBase="/models"
        create={async (body) => {
          const { model, job } = await createModel(body);
          return { slug: model.slug, job };
        }}
      />
    </main>
  );
}
