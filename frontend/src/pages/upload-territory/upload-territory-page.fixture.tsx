import { useState } from "react";
import { slugPreview } from "@/entities/upload";
import { CatalogShell } from "@/widgets/catalog-shell";
import { ARCHIVE_CHECKLIST, stagesFor, type UploadForm, type UploadPhase } from "./model/upload-form";
import { UploadTerritoryPage } from "./ui/upload-territory-page";

const noop = () => {};

/** A File stand-in with a large reported size — allocating a real 2.4 GB blob for a fixture is not the point. */
function fakeFile(name: string, size: number): File {
  const file = new File([], name, { type: "application/zip" });
  Object.defineProperty(file, "size", { value: size });
  return file;
}

function Live() {
  const [phase, setPhase] = useState<UploadPhase>("idle");
  const [file, setFile] = useState<File | null>(null);
  const [form, setForm] = useState<UploadForm>({ title: "", description: "", panoramaUrl: "" });

  return (
    <CatalogShell>
      <UploadTerritoryPage
        phase={phase}
        file={file}
        form={form}
        onForm={(patch) => setForm((prev) => ({ ...prev, ...patch }))}
        onFiles={(files) => {
          const picked = files[0];
          if (!picked) return;
          setFile(picked);
          setPhase("picked");
        }}
        onReplace={() => {
          setFile(null);
          setPhase("idle");
        }}
        slug={slugPreview(form.title)}
        onSubmit={noop}
        onCancel={noop}
        canUpload
        checks={ARCHIVE_CHECKLIST}
        stages={stagesFor(phase)}
      />
    </CatalogShell>
  );
}

const PICKED_FILE = fakeFile("refinery-block-c.zip", 2_400_000_000);
const PICKED_FORM: UploadForm = { title: "Refinery Block C", description: "", panoramaUrl: "" };

export default {
  empty: (
    <CatalogShell>
      <UploadTerritoryPage
        phase="idle"
        file={null}
        form={{ title: "", description: "", panoramaUrl: "" }}
        onForm={noop}
        onFiles={noop}
        onReplace={noop}
        slug=""
        onSubmit={noop}
        onCancel={noop}
        canUpload
        checks={ARCHIVE_CHECKLIST}
        stages={stagesFor("idle")}
      />
    </CatalogShell>
  ),
  picked: (
    <CatalogShell>
      <UploadTerritoryPage
        phase="picked"
        file={PICKED_FILE}
        form={PICKED_FORM}
        onForm={noop}
        onFiles={noop}
        onReplace={noop}
        slug={slugPreview(PICKED_FORM.title)}
        onSubmit={noop}
        onCancel={noop}
        canUpload
        checks={ARCHIVE_CHECKLIST}
        stages={stagesFor("picked")}
      />
    </CatalogShell>
  ),
  uploading: (
    <CatalogShell>
      <UploadTerritoryPage
        phase="uploading"
        file={PICKED_FILE}
        form={PICKED_FORM}
        onForm={noop}
        onFiles={noop}
        onReplace={noop}
        slug={slugPreview(PICKED_FORM.title)}
        progress={{
          value: 64,
          header: "64% · 1.4 GB / 2.2 GB · ~3 min",
          stats: ["chunk 197 / 308", "8 MB chunks", "23 MB/s", "resumable"],
        }}
        onSubmit={noop}
        onCancel={noop}
        canUpload
        checks={ARCHIVE_CHECKLIST}
        stages={stagesFor("uploading")}
      />
    </CatalogShell>
  ),
  noGrant: (
    <CatalogShell>
      <UploadTerritoryPage
        phase="idle"
        file={null}
        form={{ title: "", description: "", panoramaUrl: "" }}
        onForm={noop}
        onFiles={noop}
        onReplace={noop}
        slug=""
        onSubmit={noop}
        onCancel={noop}
        canUpload={false}
        checks={ARCHIVE_CHECKLIST}
        stages={stagesFor("idle")}
      />
    </CatalogShell>
  ),
  live: <Live />,
};
