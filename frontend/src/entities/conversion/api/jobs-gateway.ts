import { httpGet } from "@/shared/api";
import type { components } from "@/shared/api/dto";
import type { TargetJob } from "../model/target-job";
import { toTargetJob } from "./to-target-job";

type JobDto = components["schemas"]["Job"];

/** The latest job per target the caller may see; the gateway already dropped succeeded ones. */
export const listJobs = async (): Promise<TargetJob[]> =>
  ((await httpGet<JobDto[] | null>("/api/jobs")) ?? []).map(toTargetJob);
