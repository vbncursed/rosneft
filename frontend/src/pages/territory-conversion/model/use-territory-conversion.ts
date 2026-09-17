import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { artifactsQuery, listArtifacts } from "@/entities/content";
import {
  finishedSince,
  jobsQuery,
  listJobs,
  pollInterval,
  useJobStream,
  type TargetJob,
} from "@/entities/conversion";
import { getTerritory, territoryPath, territoryQuery } from "@/entities/territory";
import { HttpError, messageOf } from "@/shared/api";
import { unanswered } from "@/shared/lib/unanswered";
import { phaseOf, shouldOpenViewer, type Phase, type TerritoryConversionPageProps } from "./conversion-view";

export type TerritoryConversionState =
  | { status: "loading" }
  | { status: "missing" }
  | { status: "unavailable"; error: string }
  | ({ status: "ready" } & TerritoryConversionPageProps);

/**
 * The conversion page's data: the territory, its artifacts, the job on
 * record (from the SSE channel when a jobId is known and answering,
 * otherwise the jobs poll). Mirrors useModelDetail — ready once every query
 * has answered, missing only on a genuine 404, and a background refetch
 * failure never blanks the page.
 */
export function useTerritoryConversion(slug: string, jobId: string | null): TerritoryConversionState {
  const client = useQueryClient();
  const navigate = useNavigate();
  // queryFn stays a direct import so a spec's vi.mock of the barrel reaches the fetch.
  const territory = useQuery({ ...territoryQuery(slug), queryFn: () => getTerritory(slug) });
  const artifacts = useQuery({ ...artifactsQuery("territory", slug), queryFn: () => listArtifacts("territory", slug) });
  const hasLod0 = artifacts.data?.some((a) => a.lod === 0) ?? false;
  const jobs = useQuery({
    ...jobsQuery,
    queryFn: listJobs,
    // The catalog polls only while something converts; this page also waits for
    // a job that does not exist yet (the reconciler queues one within five
    // minutes), and nothing else would ever bring that row into view.
    refetchInterval: (q) =>
      pollInterval(q.state.data) ||
      (!hasLod0 && !q.state.data?.some((j) => j.kind === "territory" && j.slug === slug) ? 5000 : false),
  });
  const streamed = useJobStream(jobId, slug);

  // A target whose job just left the list has new artifacts (or, after a
  // failure, the same old ones): re-read them so the phase catches up, and
  // stale the scene bundle the route branches on — a territory that finishes
  // under the reader's eyes has to become the viewer, and this key is the only
  // thing that tells the route so.
  const previousJobs = useRef<TargetJob[] | undefined>(undefined);
  useEffect(() => {
    if (!jobs.data) return;
    for (const { kind, slug: targetSlug } of finishedSince(previousJobs.current, jobs.data)) {
      void client.invalidateQueries({ queryKey: ["artifacts", kind, targetSlug] });
      if (kind === "territory") void client.invalidateQueries({ queryKey: ["scene", targetSlug] });
    }
    previousJobs.current = jobs.data;
  }, [jobs.data, client]);

  const polled = jobs.data?.find((j) => j.kind === "territory" && j.slug === slug);
  // The stream, once it has answered, is up to four seconds fresher than the poll.
  const job = streamed ?? polled;
  const phase: Phase | null = artifacts.data && jobs.data ? phaseOf(hasLod0, job) : null;

  // A finish watched here opens the viewer, in-app. The target is the bare
  // path: dropping the `?jobId` is exactly what makes the route re-branch, and
  // a `navigate` keeps the document — the old `window.location.assign` into the
  // previous SPA is what this package removed.
  const previousPhase = useRef<Phase | null>(null);
  useEffect(() => {
    if (phase === null) return;
    if (shouldOpenViewer(previousPhase.current, phase)) void navigate({ to: territoryPath(slug) });
    previousPhase.current = phase;
  }, [phase, slug, navigate]);

  const loading = territory.isPending || artifacts.isPending || jobs.isPending;
  const territoryError = unanswered(territory);
  if (loading) return { status: "loading" };
  if (territoryError instanceof HttpError && territoryError.status === 404) return { status: "missing" };
  const otherError = territoryError ?? unanswered(artifacts) ?? unanswered(jobs);
  if (otherError) return { status: "unavailable", error: messageOf(otherError) };

  return {
    status: "ready",
    territory: territory.data!,
    phase: phase!,
    job: job ?? null,
    hasLod0,
  };
}
