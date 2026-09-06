import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { artifactsQuery, conversionStatusOf, listArtifacts } from "@/entities/content";
import { finishedSince, jobsQuery, listJobs, type TargetJob } from "@/entities/conversion";
import { deleteModel, getModel, listModels, modelQuery, modelsQuery, updateModel } from "@/entities/model";
import { runChunkedUpload } from "@/entities/upload";
import { meQuery } from "@/entities/user";
import { HttpError, messageOf } from "@/shared/api";
import { notify } from "@/shared/lib/notify";
import { unanswered } from "@/shared/lib/unanswered";
import { can } from "@/shared/session";
import type { ModelDetailPageProps } from "./detail";

export type { ModelDetailPageProps };

export type ModelDetailState =
  | { phase: "loading" }
  | { phase: "missing" }
  | { phase: "unavailable"; error: string }
  | ({ phase: "ready" } & ModelDetailPageProps & {
        pending: boolean;
        confirm: () => void;
        dismiss: () => void;
        deleteBusy: boolean;
      });

/**
 * The model page's data: the model, its artifacts, the live conversion job (if
 * any), and the delete/thumbnail mutations. Mirrors useModelLibrary's shape —
 * ready only once every query has answered, missing only on a genuine 404, and
 * a background refetch failure never blanks a page that already has data.
 */
export function useModelDetail(slug: string): ModelDetailState {
  const client = useQueryClient();
  const navigate = useNavigate();
  const me = useQuery(meQuery).data ?? null;
  // Spread each factory for its key and options, but keep queryFn a direct
  // import so a spec's vi.mock of the entity barrel reaches the fetch — the
  // factories close over the gateway via a relative import the mock cannot
  // see.
  const model = useQuery({ ...modelQuery(slug), queryFn: () => getModel(slug) });
  // GET /api/models/{slug} defaults usageCount to 0 (see entities/model's own
  // doc comment) — only the list endpoint carries the real count, so the
  // page's Delete guard needs this query too.
  const models = useQuery({ ...modelsQuery, queryFn: listModels });
  const artifacts = useQuery({ ...artifactsQuery("model", slug), queryFn: () => listArtifacts("model", slug) });
  const jobs = useQuery({ ...jobsQuery, queryFn: listJobs });
  const [pending, setPending] = useState(false);

  // A row whose job just finished has new artifacts (or, after a failure, the
  // same old ones): re-read that row's artifacts so its status catches up
  // rather than staying "pending" on stale, empty cached data.
  const previousJobs = useRef<TargetJob[] | undefined>(undefined);
  useEffect(() => {
    if (!jobs.data) return;
    for (const { kind, slug: targetSlug } of finishedSince(previousJobs.current, jobs.data)) {
      void client.invalidateQueries({ queryKey: ["artifacts", kind, targetSlug] });
    }
    previousJobs.current = jobs.data;
  }, [jobs.data, client]);

  const removal = useMutation({
    mutationFn: () => deleteModel(slug),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["models"] });
      void navigate({ to: "/models" });
    },
    onError: (err) => notify.error(messageOf(err)),
    onSettled: () => setPending(false),
  });

  const thumbnail = useMutation({
    mutationFn: async (file: File | null) =>
      updateModel(slug, { thumbnailBlobHash: file ? (await runChunkedUpload(file, {})).hash : "" }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["model", slug] });
      void client.invalidateQueries({ queryKey: ["models"] });
    },
    onError: (err) => notify.error(messageOf(err)),
  });

  const loading = model.isPending || models.isPending || artifacts.isPending || jobs.isPending;
  const modelError = unanswered(model);
  if (loading) return { phase: "loading" };
  if (modelError instanceof HttpError && modelError.status === 404) return { phase: "missing" };
  const otherError = modelError ?? unanswered(models) ?? unanswered(artifacts) ?? unanswered(jobs);
  if (otherError) return { phase: "unavailable", error: messageOf(otherError) };

  const job = jobs.data?.find((j) => j.kind === "model" && j.slug === slug);
  const status = conversionStatusOf(artifacts.data!.length > 0, job);
  const usageCount = models.data?.find((m) => m.slug === slug)?.usageCount ?? model.data!.usageCount;

  return {
    phase: "ready",
    model: { ...model.data!, usageCount },
    status,
    artifacts: artifacts.data!,
    jobError: job?.errorMessage ?? null,
    canDelete: can(me, "model:delete"),
    canWrite: can(me, "model:write"),
    thumbnailBusy: thumbnail.isPending,
    onDelete: () => setPending(true),
    onThumbnail: (file) => thumbnail.mutate(file),
    onRemoveThumbnail: () => thumbnail.mutate(null),
    pending,
    confirm: () => removal.mutate(),
    dismiss: () => setPending(false),
    deleteBusy: removal.isPending,
  };
}
