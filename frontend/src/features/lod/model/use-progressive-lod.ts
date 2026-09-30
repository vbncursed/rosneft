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
// the new target has a different hash, so `ready` is false again.
//
// A target change clears it outright. Keyed by hash alone, a level once seen
// stayed "ready" for good, so going 0 → 2 → 0 put LOD 0 straight back on
// screen: the canvas suspended on a url nobody had parsed and drew no
// territory for the whole download, with no chip and no progress. So a move
// to a coarser level clears readiness and goes through the coarse level and
// the warmer like the first visit. A move to a finer level keeps the ready
// level on screen ("held") while the new target warms: Auto climbs 2 → 1 → 0
// as the reader zooms in, and dropping to the coarsest for the whole LOD 0
// download made a zoom-in go blurrier. The held level is parsed and drawn, so
// it is the one level that is safe to keep; a move before the previous target
// was ready has nothing parsed to keep and shows the coarsest as before. A
// move back to the held level (1 → 0 → 1 before LOD 0 is ready, or LOD 0
// refused) is not a coarser move: that level never left the screen, so it
// stays there, ready, and nothing warms it again.
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
  const [heldHash, setHeldHash] = useState<string | null>(null);
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
  // A held level that broke is no longer in `available`, so it falls through
  // to the coarsest like any dropped level.
  const held = available.find((a) => a.hash === heldHash) ?? null;
  const { show, warm } = selectProgressive(available, targetLod, ready, held);
  const targetHash = target?.hash ?? null;

  // Adjusted during render, not in an effect: an effect would let one frame
  // draw the stale "ready" level first, which is the very flash this prevents.
  const [seenTarget, setSeenTarget] = useState(targetHash);
  if (seenTarget !== targetHash) {
    const previous = available.find((a) => a.hash === seenTarget);
    const finer = previous !== undefined && target !== null && target.lod < previous.lod;
    setHeldHash(finer && readyHash === seenTarget ? seenTarget : null);
    setSeenTarget(targetHash);
    // A new target that is the held level is parsed and on screen: it is
    // ready, and the hold ends. Manual (1 → 0 → 1) or a refused finer level,
    // clearing here dropped to the coarsest and warmed it again — for good
    // after a refusal, whose level the territory never mints a blob for. The
    // way back is the same url with no fetch, so the mesh on screen does not
    // even remount: a manual return adopts the held blob; after a refusal the
    // download still names the refused level and gltf-model maps the held
    // hash to its blob.
    setReadyHash(targetHash !== null && targetHash === heldHash ? targetHash : null);
  }

  const drop = (hash: string | undefined) => {
    if (hash) setBroken((prev) => (prev.includes(hash) ? prev : [...prev, hash]));
  };

  return {
    url: show && !failure ? urlOf(show) : null,
    warmUrl: warm && !failure ? urlOf(warm) : null,
    shown: failure ? null : show,
    target,
    failure,
    // The target is ready, so it is what shows: the hold is over. Kept, it
    // called the held level ready on a return after it had left the screen
    // (and, in the territory, after its blob was released and evicted).
    onWarmReady: () => {
      setReadyHash(targetHash);
      setHeldHash(null);
    },
    onWarmFailed: () => drop(warm?.hash),
    onShownFailed: (err) => {
      if (show) setFailure({ hash: show.hash, status: err.status ?? null });
    },
    onShownDropped: () => drop(show?.hash),
    retry: () => {
      setFailure(null);
      setBroken([]);
      setReadyHash(null);
      setHeldHash(null);
    },
  };
}
