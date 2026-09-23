import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { finishedSince, jobsQuery, listJobs, useJobStream, type TargetJob } from "@/entities/conversion";
import { getSceneBundle, sceneQuery, sceneReady } from "@/entities/scene";
import { territoryPath } from "@/entities/territory";
import { HttpError, messageOf } from "@/shared/api";
import { unanswered } from "@/shared/lib/unanswered";
import {
  jobsPoll,
  phaseOf,
  shouldOpenViewer,
  type Phase,
  type TerritoryConversionPageProps,
} from "./conversion-view";

export type TerritoryConversionState =
  | { status: "loading" }
  | { status: "missing" }
  | { status: "unavailable"; error: string }
  | ({ status: "ready" } & TerritoryConversionPageProps);

/**
 * The conversion page's data: the scene bundle the route already holds (the
 * territory and its LOD chain), and the job on record — from the SSE channel
 * when a jobId is known and answering, otherwise the jobs poll, which stays
 * off while the stream is live. Ready once both have answered, missing only on
 * a genuine 404, and a background refetch failure never blanks the page.
 */
export function useTerritoryConversion(slug: string, jobId: string | null): TerritoryConversionState {
  const client = useQueryClient();
  const navigate = useNavigate();
  // queryFn stays a direct import so a spec's vi.mock of the barrel reaches the fetch.
  const scene = useQuery({ ...sceneQuery(slug), queryFn: () => getSceneBundle(slug) });
  const hasLod0 = scene.data ? sceneReady(scene.data) : false;
  const streamed = useJobStream(jobId, slug);
  const jobs = useQuery({
    ...jobsQuery,
    queryFn: listJobs,
    refetchInterval: (q) => jobsPoll(q.state.data, { slug, hasLod0, streamed }),
  });

  // A target whose job just left the list has a new LOD chain (or, after a
  // failure, the same old one). Stale the lists the catalog and Home build
  // their cards from, a model's artifacts for the model page, and re-read the
  // bundle the route branches on — a territory that finishes under the
  // reader's eyes has to become the viewer, and this key is the only thing
  // that tells the route so.
  const previousJobs = useRef<TargetJob[] | undefined>(undefined);
  useEffect(() => {
    if (!jobs.data) return;
    for (const { kind, slug: targetSlug } of finishedSince(previousJobs.current, jobs.data)) {
      if (kind === "model") void client.invalidateQueries({ queryKey: ["artifacts", "model", targetSlug] });
      void client.invalidateQueries({
        queryKey: [kind === "territory" ? "territories" : "models"],
        refetchType: "none",
      });
      if (kind === "territory") void client.invalidateQueries({ queryKey: ["scene", targetSlug] });
    }
    previousJobs.current = jobs.data;
  }, [jobs.data, client]);

  const polled = jobs.data?.find((j) => j.kind === "territory" && j.slug === slug);
  // The stream, once it has answered, is up to four seconds fresher than the poll.
  const job = streamed ?? polled;
  const phase: Phase | null = scene.data && jobs.data ? phaseOf(hasLod0, job) : null;

  // A finish watched here opens the viewer, in-app. The target is the bare
  // path: dropping the `?jobId` is exactly what makes the route re-branch, and
  // a `navigate` keeps the document.
  const previousPhase = useRef<Phase | null>(null);
  useEffect(() => {
    if (phase === null) return;
    if (shouldOpenViewer(previousPhase.current, phase)) void navigate({ to: territoryPath(slug) });
    previousPhase.current = phase;
  }, [phase, slug, navigate]);

  if (scene.isPending || jobs.isPending) return { status: "loading" };
  const sceneError = unanswered(scene);
  if (sceneError instanceof HttpError && sceneError.status === 404) return { status: "missing" };
  const otherError = sceneError ?? unanswered(jobs);
  if (otherError) return { status: "unavailable", error: messageOf(otherError) };

  return {
    status: "ready",
    territory: scene.data!.territory,
    phase: phase!,
    job: job ?? null,
    hasLod0,
  };
}
