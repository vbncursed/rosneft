import { useState } from "react";
import { CatalogShell } from "@/widgets/catalog-shell";
import { batchMix, batchStats, makeRow, MODEL_CHECKLIST, type QueueRow } from "./model/batch";
import { UploadModelsPage } from "./ui/upload-models-page";

const noop = () => {};

/** A File stand-in with a chosen size — allocating real archive-sized blobs for a fixture is not the point. */
function fakeFile(name: string, size: number): File {
  const file = new File([], name, { type: "application/zip" });
  Object.defineProperty(file, "size", { value: size });
  return file;
}

const THUMB = fakeFile("thumb.png", 40_000);

const MIXED_ROWS: QueueRow[] = [
  { ...makeRow(fakeFile("pump-jack-unit.zip", 38 * 1024 * 1024)), title: "Pump Jack Unit", status: "done", thumbnail: THUMB },
  { ...makeRow(fakeFile("storage-tank-500.zip", 96 * 1024 * 1024)), title: "Storage Tank 500", status: "done", thumbnail: THUMB },
  {
    ...makeRow(fakeFile("valve-assembly.zip", 184 * 1024 * 1024)),
    title: "Valve Assembly",
    status: "uploading",
    progress: 0.62,
    thumbnail: THUMB,
  },
  { ...makeRow(fakeFile("pipe-rack-b7.zip", 742 * 1024 * 1024)), title: "Pipe Rack B7" },
  {
    ...makeRow(fakeFile("flare-stack.zip", 84 * 1024 * 1024)),
    title: "Flare Stack",
    status: "failed",
    error: "OBJ parse error at line 84120",
  },
];

const CURRENT = {
  row: MIXED_ROWS[2],
  progress: { bytes: 117_440_512, total: 184 * 1024 * 1024, chunk: 14, chunks: 23 },
  stats: { chunk: "14 / 23", speed: "24.6 MB/s", thumbnail: "attached" },
};

function Live() {
  const [rows, setRows] = useState<QueueRow[]>([]);

  return (
    <CatalogShell>
      <UploadModelsPage
        rows={rows}
        onFiles={(files) => setRows((prev) => [...prev, ...files.map(makeRow)])}
        onTitle={(id, title) => setRows((prev) => prev.map((r) => (r.id === id ? { ...r, title } : r)))}
        onRemove={(id) => setRows((prev) => prev.filter((r) => r.id !== id))}
        onThumbnail={(id, file) =>
          setRows((prev) => prev.map((r) => (r.id === id ? { ...r, thumbnail: file ?? undefined } : r)))
        }
        onClearDone={() => setRows((prev) => prev.filter((r) => r.status !== "done"))}
        onRun={noop}
        onCancel={noop}
        running={false}
        mix={batchMix(rows)}
        stats={batchStats(rows)}
        checks={MODEL_CHECKLIST}
        canUpload
        failedNames={rows.filter((r) => r.status === "failed").map((r) => r.file.name)}
      />
    </CatalogShell>
  );
}

export default {
  empty: (
    <CatalogShell>
      <UploadModelsPage
        rows={[]}
        onFiles={noop}
        onTitle={noop}
        onRemove={noop}
        onThumbnail={noop}
        onClearDone={noop}
        onRun={noop}
        onCancel={noop}
        running={false}
        mix={batchMix([])}
        stats={batchStats([])}
        checks={MODEL_CHECKLIST}
        canUpload
        failedNames={[]}
      />
    </CatalogShell>
  ),
  mixed: (
    <CatalogShell>
      <UploadModelsPage
        rows={MIXED_ROWS}
        onFiles={noop}
        onTitle={noop}
        onRemove={noop}
        onThumbnail={noop}
        onClearDone={noop}
        onRun={noop}
        onCancel={noop}
        running
        current={CURRENT}
        mix={batchMix(MIXED_ROWS)}
        stats={batchStats(MIXED_ROWS)}
        checks={MODEL_CHECKLIST}
        canUpload
        failedNames={MIXED_ROWS.filter((r) => r.status === "failed").map((r) => r.file.name)}
      />
    </CatalogShell>
  ),
  noGrant: (
    <CatalogShell>
      <UploadModelsPage
        rows={[]}
        onFiles={noop}
        onTitle={noop}
        onRemove={noop}
        onThumbnail={noop}
        onClearDone={noop}
        onRun={noop}
        onCancel={noop}
        running={false}
        mix={batchMix([])}
        stats={batchStats([])}
        checks={MODEL_CHECKLIST}
        canUpload={false}
        failedNames={[]}
      />
    </CatalogShell>
  ),
  live: <Live />,
};
