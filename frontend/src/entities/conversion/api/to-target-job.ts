import type * as Dto from "@/shared/api/dto";
import type { TargetJob } from "../model/target-job";

type JobDto = Dto.Job;

export const toTargetJob = (d: JobDto): TargetJob => ({
  kind: d.kind,
  slug: d.slug,
  status: d.status,
  progress: d.progress ?? null,
  stage: d.stage ?? null,
  errorMessage: d.errorMessage ?? null,
});
