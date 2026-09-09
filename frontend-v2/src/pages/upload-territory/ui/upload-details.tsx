import { Card } from "@/shared/ui/card";
import { SectionHeading } from "@/shared/ui/section-heading";
import { Textarea, TextField } from "@/shared/ui/text-field";
import type { UploadForm } from "../model/upload-form";

export type UploadDetailsProps = {
  form: UploadForm;
  onForm: (patch: Partial<UploadForm>) => void;
  slug: string;
};

/** Title, description and the optional panorama link — the slug previews live under the title. */
export function UploadDetails({ form, onForm, slug }: UploadDetailsProps) {
  return (
    <Card padded={false} className="flex flex-col gap-4 p-[22px]">
      <SectionHeading title="Details" count="slug is generated from the title" />

      <div>
        <TextField
          label="Title"
          required
          value={form.title}
          onChange={(e) => onForm({ title: e.target.value })}
        />
        {slug ? (
          <p className="mt-[7px] flex gap-[7px] font-mono text-[11px]">
            <span className="text-dim">slug</span>
            <span className="text-accent">{slug}</span>
          </p>
        ) : null}
      </div>

      <Textarea
        label="Description"
        value={form.description}
        onChange={(e) => onForm({ description: e.target.value })}
      />

      <TextField
        label="Panorama tour URL"
        mono
        hint="Optional. Link to an externally-hosted 360° tour — shown as a button in the viewer."
        value={form.panoramaUrl}
        onChange={(e) => onForm({ panoramaUrl: e.target.value })}
      />
    </Card>
  );
}
