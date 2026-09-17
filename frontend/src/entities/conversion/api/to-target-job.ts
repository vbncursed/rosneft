import type { components } from "@/shared/api/dto";
import type { TargetJob } from "../model/target-job";

type JobDto = components["schemas"]["Job"];

export const toTargetJob = (d: JobDto): TargetJob => ({
  kind: d.kind,
  slug: d.slug,
  status: d.status,
  progress: d.progress ?? null,
  stage: d.stage ?? null,
  errorMessage: d.errorMessage ?? null,
});
