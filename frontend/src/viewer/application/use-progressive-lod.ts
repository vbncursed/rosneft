import { useState } from "react";
import {
  pickLod,
  selectProgressive,
  type LodArtifact,
} from "@/shared/domain/lod-artifact";
import { lodUrl } from "@/shared/application/lod-url";

export interface ProgressiveLod {
  url: string | null;
  warmUrl: string | null;
  onWarmReady: () => void;
  onFailed: () => void;
}

// useProgressiveLod shows the cheapest level in the chain immediately and
// upgrades to the target once it has downloaded.
//
// Readiness is keyed by the target's content hash rather than a boolean, so a
// chain that changes underneath (the asset was reconverted, the placement now
// points at a different model) resets itself without any derived-state dance:
// the new target has a different hash, so `ready` is false again.
//
// Failed levels are tracked by hash too and simply drop out of the chain,
// which is what the placement's old fallback ladder did by index. Doing it
// here means the territory gets the same protection, and it had none.
export function useProgressiveLod(
  chain: LodArtifact[],
  targetLod = 0,
): ProgressiveLod {
  const [readyHash, setReadyHash] = useState<string | null>(null);
  const [broken, setBroken] = useState<readonly string[]>([]);

  // No useMemo/useCallback here, and the reason is narrower than it looks.
  // eslint-plugin-react-hooks v7 ships React-Compiler-derived rules, and
  // `preserve-manual-memoization` rejects manual memoization the compiler could
  // not reproduce — it fires whether or not the compiler is actually wired into
  // the build, and here it is NOT (no babel-plugin-react-compiler, and
  // vite.config.ts calls react() with no options).
  //
  // So nothing memoizes these for us: onWarmReady/onFailed are fresh closures
  // each render, and LodWarmer's effect lists onReady as a dependency. The cost
  // is bounded — the effect only re-runs setReadyHash with a value it already
  // holds, which React discards, and LodWarmer unmounts the moment the swap
  // lands. Left as is rather than routed through a ref: that trades a real
  // indirection for a redundant no-op.
  const available = chain.filter((a) => !broken.includes(a.hash));
  const target = pickLod(available, targetLod);
  const ready = target !== null && readyHash === target.hash;
  const { show, warm } = selectProgressive(available, targetLod, ready);

  const showHash = show?.hash ?? null;
  const targetHash = target?.hash ?? null;

  const onWarmReady = () => setReadyHash(targetHash);
  const onFailed = () => {
    if (showHash === null) return;
    setBroken((prev) => (prev.includes(showHash) ? prev : [...prev, showHash]));
  };

  return {
    url: show ? lodUrl(show) : null,
    warmUrl: warm ? lodUrl(warm) : null,
    onWarmReady,
    onFailed,
  };
}
