import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { finishedSince, type TargetJob, type TargetKind } from "./target-job";

/** The list query each kind's cards and rows are built from. */
export const LIST_KEY: Record<TargetKind, string> = { territory: "territories", model: "models" };

type Target = { kind: TargetKind; slug: string };

/**
 * What a finished conversion changed: the list (its rows carry `lods`) and,
 * for a territory, the scene bundle the viewer and the conversion route read;
 * for a model, its artifacts (Model Detail). Nothing reads a territory's
 * artifacts query, so it is not named.
 */
export const staleKeysOf = ({ kind, slug }: Target): unknown[][] =>
  kind === "territory" ? [[LIST_KEY.territory], ["scene", slug]] : [[LIST_KEY.model], ["artifacts", "model", slug]];

/**
 * Marks stale whatever a conversion changed once its job leaves the live set
 * between two answers of `GET /api/jobs`. A query on screen refetches; one
 * that is not is re-read on its next mount. `handled` is a target whose finish
 * another channel already marked — the conversion page's job stream — so its
 * bundle is not asked for twice.
 */
export function useStaleOnFinish(jobs: TargetJob[] | undefined, handled: TargetJob | null = null) {
  const client = useQueryClient();
  const previous = useRef<TargetJob[] | undefined>(undefined);
  useEffect(() => {
    if (!jobs) return;
    for (const target of finishedSince(previous.current, jobs)) {
      if (handled?.kind === target.kind && handled.slug === target.slug) continue;
      for (const queryKey of staleKeysOf(target)) void client.invalidateQueries({ queryKey });
    }
    previous.current = jobs;
  }, [jobs, handled, client]);
}
