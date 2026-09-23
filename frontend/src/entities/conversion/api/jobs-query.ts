import { queryOptions } from "@tanstack/react-query";
import { pollInterval } from "../model/target-job";
import { listJobs } from "./jobs-gateway";

/**
 * Polls only while a conversion is live, and never in a hidden tab. Always
 * stale: the route is no-store, and a job started elsewhere must show on mount.
 */
export const jobsQuery = queryOptions({
  queryKey: ["jobs"],
  queryFn: listJobs,
  staleTime: 0,
  refetchInterval: (query) => pollInterval(query.state.data),
  refetchIntervalInBackground: false,
});
