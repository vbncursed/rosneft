import { CatalogShell } from "@/widgets/catalog-shell";
import { stagesFor } from "./model/replace-form";
import { ReplaceSourcePage } from "./ui/replace-source-page";

const noop = () => {};

/** A File stand-in with a large reported size — allocating a real 1.4 GB blob for a fixture is not the point. */
function fakeFile(name: string, size: number): File {
  const file = new File([], name, { type: "application/zip" });
  Object.defineProperty(file, "size", { value: size });
  return file;
}

const TERRITORY = {
  slug: "refinery-block-c",
  title: "Refinery Block C",
  sourceBlobHash: `5b81${"0".repeat(56)}c40e`,
  placementCount: 4,
  createdAt: "2026-09-02T00:00:00Z",
};

const CURRENT_SIZE = 1_288_490_189; // formatBytes -> "1.2 GB"
const NEW_FILE = fakeFile("refinery-block-c-rev4.zip", 1_503_238_554); // formatBytes -> "1.4 GB"

export default {
  idle: (
    <CatalogShell>
      <ReplaceSourcePage
        territory={TERRITORY}
        currentSize={CURRENT_SIZE}
        phase="idle"
        file={null}
        onFiles={noop}
        onReplace={noop}
        onSubmit={noop}
        onCancel={noop}
        canReplace
        stages={stagesFor("idle", null)}
      />
    </CatalogShell>
  ),
  picked: (
    <CatalogShell>
      <ReplaceSourcePage
        territory={TERRITORY}
        currentSize={CURRENT_SIZE}
        phase="picked"
        file={NEW_FILE}
        onFiles={noop}
        onReplace={noop}
        onSubmit={noop}
        onCancel={noop}
        canReplace
        stages={stagesFor("picked", null)}
      />
    </CatalogShell>
  ),
  uploading: (
    <CatalogShell>
      <ReplaceSourcePage
        territory={TERRITORY}
        currentSize={CURRENT_SIZE}
        phase="uploading"
        file={NEW_FILE}
        progress={{
          value: 41,
          header: "41% · 574 MB / 1.4 GB",
          stats: ["chunk 71 / 175", "8 MB chunks", "24.6 MB/s", "~4 min left"],
        }}
        onFiles={noop}
        onReplace={noop}
        onSubmit={noop}
        onCancel={noop}
        canReplace
        stages={stagesFor("uploading", 41)}
      />
    </CatalogShell>
  ),
};
