import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { assetSize } from "@/entities/content";
import { getTerritory, replaceTerritorySource, territoryQuery } from "@/entities/territory";
import { progressFor, runChunkedUpload, type UploadProgress, type UploadSample } from "@/entities/upload";
import { meQuery } from "@/entities/user";
import { HttpError, messageOf } from "@/shared/api";
import { leaveTo } from "@/shared/lib/leave";
import { notify } from "@/shared/lib/notify";
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
 * -> replacing -> (leaves for the old SPA's conversion screen) | picked (on a
 * throw, toasted, or a cancel, silent — the file is kept either way).
 */
export function useReplaceSource(slug: string): ReplaceSourceState {
  const client = useQueryClient();
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
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [samples, setSamples] = useState<UploadSample[]>([]);
  const controller = useRef<AbortController | null>(null);

  const onFiles = (files: File[]) => {
    const picked = files[0];
    if (!picked) return;
    setFile(picked);
    setProgress(null);
    setPhase("picked");
  };

  const onReplace = () => {
    setFile(null);
    setProgress(null);
    setPhase("idle");
  };

  const onSubmit = () => {
    if (phase !== "picked" || !file) return;
    const ac = new AbortController();
    controller.current = ac;
    setSamples([{ at: Date.now(), bytes: 0 }]);
    // A retry after a cancel/failure must not show the previous attempt's
    // numbers until this run's own onProgress has something to say.
    setProgress(null);
    setPhase("uploading");

    runChunkedUpload(file, {
      signal: ac.signal,
      onStage: (stage) => {
        if (stage === "finalizing") setPhase("finalizing");
      },
      onProgress: (p) => {
        setSamples((prev) => [...prev, { at: Date.now(), bytes: p.bytes }]);
        setProgress(p);
      },
    })
      .then((finalized) => {
        setPhase("replacing");
        return replaceTerritorySource(slug, finalized.hash);
      })
      .then(async ({ territory: replaced, job }) => {
        await Promise.all([
          client.invalidateQueries({ queryKey: ["jobs"] }),
          client.invalidateQueries({ queryKey: ["territories"] }),
        ]);
        leaveTo(`/territories/${encodeURIComponent(replaced.slug)}?jobId=${job.id}`);
      })
      .catch((err: unknown) => {
        setPhase("picked");
        // A deliberate cancel is not a failure to report — only a genuine
        // throw (a dropped connection, a gateway refusal) gets a toast.
        if (ac.signal.aborted) return;
        notify.error(messageOf(err));
      });
  };

  const onCancel = () => controller.current?.abort();

  const pending = territory.isPending || size.isLoading;
  if (pending) return { status: "loading" };

  const failure = unanswered(territory);
  if (failure instanceof HttpError && failure.status === 404) return { status: "missing" };
  if (failure) return { status: "unavailable", error: messageOf(failure) };

  const percent = progress ? Math.round((progress.bytes / progress.total) * 100) : null;

  return {
    status: "ready",
    // Safe: `failure` is null here, so `unanswered` says the query already
    // holds data — see shared/lib/unanswered.
    territory: territory.data!,
    currentSize: size.data ?? null,
    phase,
    file,
    progress: progressFor(phase === "uploading" || phase === "finalizing", progress, samples),
    onFiles,
    onReplace,
    onSubmit,
    onCancel,
    canReplace: can(me, "territory:write"),
    stages: stagesFor(phase, percent),
  };
}
