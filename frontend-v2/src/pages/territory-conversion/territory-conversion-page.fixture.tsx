import type { TargetJob } from "@/entities/conversion";
import { CatalogShell } from "@/widgets/catalog-shell";
import type { Phase } from "./model/conversion-view";
import { TerritoryConversionPage } from "./ui/territory-conversion-page";

const TERRITORY = {
  slug: "refinery-block-c",
  title: "Refinery Block C",
  sourceBlobHash: `9f1c${"0".repeat(56)}82ab`,
  placementCount: 0,
};

const running: TargetJob = { kind: "territory", slug: TERRITORY.slug, status: "running", progress: 0.58, stage: "lod-1", errorMessage: null };
const queued: TargetJob = { kind: "territory", slug: TERRITORY.slug, status: "pending", progress: null, stage: null, errorMessage: null };
const failed: TargetJob = { kind: "territory", slug: TERRITORY.slug, status: "failed", progress: null, stage: "compressing", errorMessage: "ktx2: unsupported pixel format in tank_albedo_04.tga" };
// GET /api/jobs for cotest on 2026-09-07 — no stage, no progress, only the message.
const failedLive: TargetJob = { kind: "territory", slug: TERRITORY.slug, status: "failed", progress: null, stage: null, errorMessage: "fetch/extract source: blob get: blobstore: blob not found" };

const noop = () => {};

const page = (phase: Phase, job: TargetJob | null, hasLod0 = false) => (
  <CatalogShell>
    <TerritoryConversionPage territory={TERRITORY} phase={phase} job={job} hasLod0={hasLod0} onOpenViewer={noop} />
  </CatalogShell>
);

export default {
  running: page("running", running),
  queued: page("queued", queued),
  "queued, no record": page("queued", null),
  failed: page("failed", failed),
  "failed, previous revision live": page("failed", failed, true),
  "failed, no stage (live shape)": page("failed", failedLive),
  ready: page("ready", null, true),
};
