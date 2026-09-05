import { queryOptions } from "@tanstack/react-query";
import { pollInterval } from "../model/target-job";
import { listJobs } from "./jobs-gateway";

/** Polls only while a conversion is live, and never in a hidden tab. */
export const jobsQuery = queryOptions({
  queryKey: ["jobs"],
  queryFn: listJobs,
  refetchInterval: (query) => pollInterval(query.state.data),
  refetchIntervalInBackground: false,
});
