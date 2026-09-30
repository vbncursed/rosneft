import type { QueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef } from "react";
import { dropOrOweScene, takeSceneDrop } from "./owed-scene-drop";

/**
 * Marked stale, never refetched from here: every list on this page seeds
 * once and is optimistic afterwards, so a refetch changes nothing on screen.
 * The territory and model queries go stale too — a write here changes
 * `placementCount` and `usageCount` on their lists and details. The bundle
 * is dropped on the way out (below): the lists would seed from it on the
 * next visit and never adopt the refetch. A ref, not the query's
 * `isInvalidated`: a rename's setQueryData clears that flag. A write that
 * lands after the page has gone drops the bundle itself (`left`) — unless a
 * new visit is already reading it: that visit keeps it, marked stale, and
 * owes the drop on its own way out (`owed-scene-drop.ts`).
 */
export function useSceneDrop(client: QueryClient, slug: string): () => void {
  const changed = useRef(false);
  const left = useRef(false);
  const onChanged = useCallback(() => {
    changed.current = true;
    const keys = [["scene", slug], ["territory", slug], ["territories"], ["model"], ["models"]];
    for (const queryKey of keys) void client.invalidateQueries({ queryKey, refetchType: "none" });
    if (left.current) dropOrOweScene(client, slug);
  }, [client, slug]);
  useEffect(() => {
    left.current = changed.current = false;
    return () => {
      left.current = true;
      // take first, so a debt is paid even when this visit changed something too.
      if (takeSceneDrop(client, slug) || changed.current) client.removeQueries({ queryKey: ["scene", slug], exact: true });
    };
  }, [client, slug]);
  return onChanged;
}
