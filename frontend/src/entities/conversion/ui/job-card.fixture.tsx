import { toJobCard, type TitleOf } from "../model/job-card";
import type { TargetJob } from "../model/target-job";
import { JobCard } from "./job-card";

const TITLES: Record<string, string> = {
  "refinery-block-c": "Refinery Block C",
  "pipe-rack-b7": "Pipe Rack B7",
  "valve-cluster": "Valve cluster",
  "north-field-survey-with-a-very-long-name":
    "North field survey, west quadrant, photogrammetry pass two",
};

const titleOf: TitleOf = (_kind, slug) => TITLES[slug];

const job = (over: Partial<TargetJob>): TargetJob => ({
  kind: "territory",
  slug: "refinery-block-c",
  status: "running",
  progress: 0.58,
  stage: "lod-1",
  errorMessage: null,
  ...over,
});

const JOBS: TargetJob[] = [
  job({}),
  job({ kind: "model", slug: "valve-cluster", status: "pending", progress: null, stage: null }),
  job({
    slug: "pipe-rack-b7",
    status: "failed",
    progress: null,
    stage: "compressing",
    errorMessage: "ktx2: unsupported pixel format in tank_albedo_04.tga",
  }),
  job({
    slug: "north-field-survey-with-a-very-long-name",
    status: "failed",
    progress: null,
    stage: "parsing",
    errorMessage:
      "obj: material library tank_albedo_04.mtl references a texture that is not in the archive, and the eleven other maps it declares resolved to the same missing directory",
  }),
];

export default (
  <div className="flex flex-col gap-[9px] p-6">
    {JOBS.map((j) => (
      <JobCard key={`${j.kind}/${j.slug}`} card={toJobCard(j, titleOf)} />
    ))}
  </div>
);
