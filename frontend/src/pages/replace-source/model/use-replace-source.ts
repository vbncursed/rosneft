import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { assetSize } from "@/entities/content";
import { getTerritory, replaceTerritorySource, territoryQuery } from "@/entities/territory";
import { runChunkedUpload, useUploadRun } from "@/entities/upload";
import { meQuery } from "@/entities/user";
import { HttpError, messageOf } from "@/shared/api";
import { unanswered } from "@/shared/lib/unanswered";
import { can } from "@/shared/session";
import { stagesFor, type ReplacePhase, type ReplaceSourcePageProps } from "./replace-form";

export type ReplaceSourceState =
  | { status: "loading" }
  | { status: "missing" }
  | { status: "unavailable"; error: string }
  | ({ status: "ready" } & ReplaceSourcePageProps);

/**
 * The replace-source state machine: idle -> picked -> uploading -> finalizing
 * -> replacing -> (navigates to the territory's conversion page) | picked (on
 * a throw, toasted, or a cancel, silent — the file is kept either way).
 */
export function useReplaceSource(slug: string): ReplaceSourceState {
  const client = useQueryClient();
  const navigate = useNavigate();
  const me = useQuery(meQuery).data ?? null;
  // queryFn stays a direct import (rather than territoryQuery's own bound
  // one) so a spec's vi.mock of the entity barrel reaches the fetch.
  const territory = useQuery({ ...territoryQuery(slug), queryFn: () => getTerritory(slug) });
  const hash = territory.data?.sourceBlobHash;
  // Disabled until the territory answers with a hash — `isLoading`, not
  // `isPending`, is what "loading" asks: a disabled query never fetches, so
  // isPending stays true forever while it is off.
  const size = useQuery({
    queryKey: ["asset-size", hash],
    queryFn: () => assetSize(hash as string),
    enabled: !!hash,
  });

  const [phase, setPhase] = useState<ReplacePhase>("idle");
  const upload = useUploadRun();
  const { file } = upload;

  const onFiles = (files: File[]) => {
    if (upload.pick(files)) setPhase("picked");
  };

  const onReplace = () => {
    upload.clear();
    setPhase("idle");
  };

  const onSubmit = () => {
    if (phase !== "picked" || !file) return;
    setPhase("uploading");

    runChunkedUpload(
      file,
      upload.begin((stage) => {
        if (stage === "finalizing") setPhase("finalizing");
      }),
    )
      .then((finalized) => {
        setPhase("replacing");
        // The replace deletes the old artifacts — possibly before a failure
        // answers — and a bundle cached before it still holds a LOD0 the
        // route's loader would hand back as the result: drop it either way.
        return replaceTerritorySource(slug, finalized.hash).finally(() =>
          client.removeQueries({ queryKey: ["scene", slug] }),
        );
      })
      .then(async ({ territory: replaced, job }) => {
        await Promise.all([
          client.invalidateQueries({ queryKey: ["jobs"] }),
          client.invalidateQueries({ queryKey: ["territories"] }),
          client.invalidateQueries({ queryKey: ["territory", slug] }),
        ]);
        return navigate({ href: `/territories/${encodeURIComponent(replaced.slug)}?jobId=${job.id}` });
      })
      .catch((err: unknown) => {
        setPhase("picked");
        upload.fail(err);
      });
  };

  const onCancel = upload.cancel;

  const pending = territory.isPending || size.isLoading;
  if (pending) return { status: "loading" };

  const failure = unanswered(territory);
  if (failure instanceof HttpError && failure.status === 404) return { status: "missing" };
  if (failure) return { status: "unavailable", error: messageOf(failure) };

  return {
    status: "ready",
    // Safe: `failure` is null here, so `unanswered` says the query already
    // holds data — see shared/lib/unanswered.
    territory: territory.data!,
    currentSize: size.data ?? null,
    phase,
    file,
    progress: upload.view(phase === "uploading" || phase === "finalizing"),
    onFiles,
    onReplace,
    onSubmit,
    onCancel,
    canReplace: can(me, "territory:write"),
    stages: stagesFor(phase, upload.percent),
  };
}
