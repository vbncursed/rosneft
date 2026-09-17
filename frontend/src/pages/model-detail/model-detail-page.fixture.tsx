import { ModelDetailPage } from "./ui/model-detail-page";

const MODEL = {
  slug: "valve-assembly",
  title: "Valve Assembly",
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

export default {
  // `thumbnailBlobHash` always resolves through /api/assets/{hash} — there is
  // no way to hand ModelDetailPage a literal data-URI without changing its
  // Model-shaped contract, so this fixture points at a hash the dev proxy
  // will 404 on outside a live gateway. Live-check (task brief step 8)
  // exercises the real image against the real blob.
  ready: (
    <ModelDetailPage
      model={{ ...MODEL, thumbnailBlobHash: "thumb-hash" }}
      status="ready"
      artifacts={ARTIFACTS}
      jobError={null}
      canDelete
      canWrite
      thumbnailBusy={false}
      onDelete={noop}
      onThumbnail={noop}
      onRemoveThumbnail={noop}
    />
  ),
  converting: (
    <ModelDetailPage
      model={{ ...MODEL, usageCount: 0 }}
      status="converting"
      artifacts={[]}
      jobError={null}
      canDelete
      canWrite
      thumbnailBusy={false}
      onDelete={noop}
      onThumbnail={noop}
      onRemoveThumbnail={noop}
    />
  ),
  noImage: (
    <ModelDetailPage
      model={MODEL}
      status="ready"
      artifacts={ARTIFACTS}
      jobError={null}
      canDelete={false}
      canWrite
      thumbnailBusy={false}
      onDelete={noop}
      onThumbnail={noop}
      onRemoveThumbnail={noop}
    />
  ),
};
