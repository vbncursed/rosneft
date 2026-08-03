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

  // No useMemo/useCallback here on purpose: the React Compiler is on in this
  // project and refuses to optimise a component whose manual memoization it
  // cannot preserve. It memoizes these itself, and the identity of
  // onWarmReady/onFailed matters — LodWarmer's effect takes onReady as a
  // dependency.
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
