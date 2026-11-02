import { CatalogShell } from "@/widgets/catalog-shell";
import { ModelDetailPage } from "./ui/model-detail-page";

const MODEL = {
  slug: "valve-assembly",
  title: "Valve Assembly",
  tag: { slug: "tanks", title: "Tanks" },
  description:
    "Gate valve assembly with handwheel, flanged body and mounting bracket. Origin at the flange face, +Y up, metres.",
  sourceBlobHash: `9f1c${"0".repeat(56)}82ab`,
  usageCount: 2,
  createdAt: "2026-09-02T10:00:00Z",
};

const artifact = (lod: number, faces: number, size: number) => ({
  lod,
  hash: `h${lod}`,
  size,
  faces,
  vertices: faces * 2,
  bboxMin: { x: 0, y: 0, z: 0 },
  bboxMax: { x: 1.2, y: 1.8, z: 0.9 },
});

const ARTIFACTS = [
  artifact(0, 18412, 9.8 * 1024 * 1024),
  artifact(1, 6140, 2.1 * 1024 * 1024),
  artifact(2, 1320, 412 * 1024),
];

const noop = () => {};

const TAGS = [
  { slug: "tanks", title: "Tanks" },
  { slug: "pumps", title: "Pumps" },
  { slug: "ungrouped", title: "Ungrouped" },
];

export default {
  // The hashes h0…h2 are fake, so through the dev proxy the viewport shows the
  // error card for valve-assembly-lod2.glb: that is this fixture's failure
  // state. A real model is checked live (Task 7).
  ready: (
    <CatalogShell>
      <ModelDetailPage
        model={{ ...MODEL, thumbnailBlobHash: "thumb-hash" }}
        status="ready"
        artifacts={ARTIFACTS}
        jobError={null}
        canDelete
        canWrite
        thumbnailBusy={false}
        tags={TAGS}
        tagsError={null}
        tagBusy={false}
        onTag={noop}
        onDelete={noop}
        onThumbnail={noop}
        onRemoveThumbnail={noop}
      />
    </CatalogShell>
  ),
  converting: (
    <CatalogShell>
      <ModelDetailPage
        model={{ ...MODEL, usageCount: 0 }}
        status="converting"
        artifacts={[]}
        jobError={null}
        canDelete
        canWrite
        thumbnailBusy={false}
        tags={TAGS}
        tagsError={null}
        tagBusy={false}
        onTag={noop}
        onDelete={noop}
        onThumbnail={noop}
        onRemoveThumbnail={noop}
      />
    </CatalogShell>
  ),
  failed: (
    <CatalogShell>
      <ModelDetailPage
        model={{ ...MODEL, usageCount: 0 }}
        status="failed"
        artifacts={[]}
        jobError="mesh-worker: unsupported archive layout"
        canDelete
        canWrite
        thumbnailBusy={false}
        tags={TAGS}
        tagsError={null}
        tagBusy={false}
        onTag={noop}
        onDelete={noop}
        onThumbnail={noop}
        onRemoveThumbnail={noop}
      />
    </CatalogShell>
  ),
  pending: (
    <CatalogShell>
      <ModelDetailPage
        model={{ ...MODEL, usageCount: 0 }}
        status="pending"
        artifacts={[]}
        jobError={null}
        canDelete
        canWrite
        thumbnailBusy={false}
        tags={TAGS}
        tagsError={null}
        tagBusy={false}
        onTag={noop}
        onDelete={noop}
        onThumbnail={noop}
        onRemoveThumbnail={noop}
      />
    </CatalogShell>
  ),
};
