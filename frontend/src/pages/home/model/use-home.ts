import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { myAuditQuery, type AuditEntry } from "@/entities/audit";
import {
  useStaleOnFinish,
  jobsQuery,
  sortJobs,
  toJobCard,
  type JobCardModel,
  type TargetJob,
} from "@/entities/conversion";
import { modelsQuery, toModelCard, type ModelCardModel } from "@/entities/model";
import { territoriesQuery, toTerritoryCard, type TerritoryCardModel } from "@/entities/territory";
import { meQuery } from "@/entities/user";
import { messageOf } from "@/shared/api";
import { unanswered } from "@/shared/lib/unanswered";
import { can, viewerOf, type Viewer } from "@/shared/session";
import {
  ACTIVITY_ROWS,
  bareCard,
  headerMeta,
  jobsMeta,
  MODEL_CARDS,
  modelsMeta,
  recent,
  TERRITORY_CARDS,
  territoriesMeta,
  titleOf,
  viewerEmpty,
} from "./home-view";

export type HomeState = {
  status: "loading" | "ready" | "unavailable";
  error: string | null;
  meta: string;
  /** Who is signed in, for the header pill. Empty strings while the cache is cold. */
  viewer: Viewer;
  /** [] hides the strip. */
  jobs: JobCardModel[];
  jobsMeta: string;
  territories: { cards: TerritoryCardModel[]; total: number; meta: string; viewerEmpty: boolean };
  models: { cards: ModelCardModel[]; total: number; meta: string; shown: boolean };
  /** null is "we could not find out" — a Guest's 403 on /api/audit/mine. */
  activity: AuditEntry[] | null;
  activityLoading: boolean;
};

/**
 * Everything Home decides. Three lists (each row carries its own LODs), the
 * jobs poll and the first page of the reader's own journal — nothing per row.
 * The feed never blocks the page.
 */
export function useHome(): HomeState {
  const me = useQuery(meQuery).data ?? null;
  const territories = useQuery(territoriesQuery);
  const models = useQuery(modelsQuery);
  const jobs = useQuery(jobsQuery);
  const feed = useInfiniteQuery(myAuditQuery);

  const shown = recent(territories.data ?? [], TERRITORY_CARDS);

  // A finished job's new LODs ride on the lists, a model's on its artifacts.
  useStaleOnFinish(jobs.data);

  const failed = unanswered(territories) ?? unanswered(models) ?? unanswered(jobs);
  const loading = territories.isPending || models.isPending || jobs.isPending;

  const allTerritories = territories.data ?? [];
  const allModels = models.data ?? [];
  const allJobs = jobs.data ?? [];
  const jobOf = (kind: TargetJob["kind"], slug: string) =>
    allJobs.find((j) => j.kind === kind && j.slug === slug);
  const canUploadTerritory = can(me, "territory:create");
  const canUploadModel = can(me, "model:write");
  const empty = viewerEmpty(allTerritories.length, canUploadTerritory, canUploadModel);
  const modelCards = recent(allModels, MODEL_CARDS).map((m) =>
    toModelCard(m, m.lods ?? [], jobOf("model", m.slug)),
  );
  const title = titleOf(allTerritories, allModels);

  return {
    status: loading ? "loading" : failed ? "unavailable" : "ready",
    error: failed ? messageOf(failed) : null,
    meta: headerMeta(allTerritories.length, allModels.length, allJobs, empty),
    viewer: me ? viewerOf(me) : { username: "", roleTitle: "" },
    jobs: sortJobs(allJobs).map((j) => toJobCard(j, title)),
    jobsMeta: jobsMeta(allJobs),
    territories: {
      cards: shown.map((t) =>
        bareCard(toTerritoryCard(t, t.lods ?? [], jobOf("territory", t.slug))),
      ),
      total: allTerritories.length,
      meta: territoriesMeta(shown.length, allTerritories.length, empty),
      viewerEmpty: empty,
    },
    models: {
      cards: modelCards,
      total: allModels.length,
      meta: modelsMeta(allModels.length),
      shown: !empty,
    },
    activity: feed.data ? feed.data.pages[0].entries.slice(0, ACTIVITY_ROWS) : null,
    activityLoading: feed.isPending,
  };
}
