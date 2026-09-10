import { useState } from "react";
import { assetUrl } from "@/entities/content";
import { pickLod, selectProgressive, type LodArtifact } from "@/entities/scene";
import type { LodFailure } from "./lod-progress";

export const lodUrl = (a: LodArtifact): string => assetUrl(a.hash);

export type ProgressiveLod = {
  url: string | null;
  warmUrl: string | null;
  shown: LodArtifact | null;
  target: LodArtifact | null;
  failure: LodFailure | null;
  onWarmReady: () => void;
  /** The higher level could not be fetched: drop it and stay coarse (the old ladder). */
  onWarmFailed: () => void;
  /** The level on screen threw: nothing is drawn until retry — the page shows the error card. */
  onShownFailed: (err: { status?: number | null }) => void;
  /** The level on screen threw where the old ladder still applies (placements): drop it, no card. */
  onShownDropped: () => void;
  retry: () => void;
};

// useProgressiveLod shows the cheapest level in the chain immediately and
// upgrades to the target once it has downloaded.
//
// Readiness is keyed by the target's content hash rather than a boolean, so a
// chain that changes underneath (the asset was reconverted, the placement now
// points at a different model) resets itself without any derived-state dance:
// the new target has a different hash, so `ready` is false again. A manual
// target change re-keys it for free, for the same reason.
//
// Failed levels are tracked by hash too and simply drop out of the chain,
// which is what the placement's old fallback ladder did by index. The
// territory's own level is the exception: a failure there is held as
// `failure` and shown on an error card, because silently dropping to a
// coarser mesh is not something the person looking at it should have to
// notice.
export function useProgressiveLod(
  chain: LodArtifact[],
  targetLod = 0,
  urlOf: (a: LodArtifact) => string = lodUrl,
): ProgressiveLod {
  const [readyHash, setReadyHash] = useState<string | null>(null);
  const [broken, setBroken] = useState<readonly string[]>([]);
  const [failure, setFailure] = useState<LodFailure | null>(null);

  // No useMemo/useCallback here, and the reason is narrower than it looks.
  // The React-Compiler-derived rules (shipped by eslint-plugin-react-hooks v7,
  // and carried over by oxlint's react plugin) reject manual memoization the
  // compiler could not reproduce — they fire whether or not the compiler is
  // actually wired into the build, and here it is NOT.
  //
  // So nothing memoizes these: onWarmReady and the rest are fresh closures on
  // every render. Consumers must therefore not key an effect on their identity
  // — the warmer holds its callback in a ref for exactly this reason, so its
  // "finished loading" effect fires once per url instead of once per re-render
  // of whatever is above it.
  const available = chain.filter((a) => !broken.includes(a.hash));
  const target = pickLod(available, targetLod);
  const ready = target !== null && readyHash === target.hash;
  const { show, warm } = selectProgressive(available, targetLod, ready);
  const targetHash = target?.hash ?? null;

  const drop = (hash: string | undefined) => {
    if (hash) setBroken((prev) => (prev.includes(hash) ? prev : [...prev, hash]));
  };

  return {
    url: show && !failure ? urlOf(show) : null,
    warmUrl: warm && !failure ? urlOf(warm) : null,
    shown: failure ? null : show,
    target,
    failure,
    onWarmReady: () => setReadyHash(targetHash),
    onWarmFailed: () => drop(warm?.hash),
    onShownFailed: (err) => {
      if (show) setFailure({ hash: show.hash, status: err.status ?? null });
    },
    onShownDropped: () => drop(show?.hash),
    retry: () => {
      setFailure(null);
      setBroken([]);
      setReadyHash(null);
    },
  };
}
