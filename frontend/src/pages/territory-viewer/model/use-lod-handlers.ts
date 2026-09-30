import { useCallback, useState } from "react";
import type { LodReport } from "@/widgets/viewer-canvas";

export type LodHandlerDeps = {
  /** Stops any coasting flight — a reset started mid-flight must land it too. */
  land: () => void;
};

const NO_REPORT: LodReport = {
  shown: null,
  target: null,
  percent: null,
  progressText: null,
  failure: null,
};

/**
 * The canvas's last report, with the moment its failure arrived.
 *
 * The error card's footer answers "when did this last try", so the clock is
 * stamped when the failure lands rather than read while the card is being
 * drawn — otherwise every re-render behind it (a reset, a panel fold, a
 * refetch) moved "last attempt" forward to now.
 */
type LodState = { report: LodReport; failedAt: Date | null };

const NO_LOD: LodState = { report: NO_REPORT, failedAt: null };

export type LodHandlers = {
  report: LodReport;
  failedAt: Date | null;
  retryVersion: number;
  resetVersion: number;
  onLod: (next: LodReport) => void;
  onReset: () => void;
  onRetry: () => void;
};

/**
 * The LOD switcher's own state and the error card's Reset/Retry, split out of
 * `usePageHandlers` at the 200-line cap.
 */
export function useLodHandlers({ land }: LodHandlerDeps): LodHandlers {
  const [lod, setLod] = useState<LodState>(NO_LOD);
  const [retryVersion, setRetryVersion] = useState(0);
  const [resetVersion, setResetVersion] = useState(0);

  const onLod = useCallback(
    (next: LodReport) =>
      setLod((prev) => ({
        report: next,
        // A second failure of the same level is the same attempt still being
        // reported; a different hash is a new one and gets a new stamp.
        failedAt: next.failure
          ? prev.report.failure?.hash === next.failure.hash
            ? prev.failedAt
            : new Date()
          : null,
      })),
    [],
  );
  // A reset lands the flight too, or the rig would fly on from the reset view.
  const onReset = useCallback(() => {
    land();
    setResetVersion((v) => v + 1);
  }, [land]);
  const onRetry = useCallback(() => setRetryVersion((v) => v + 1), []);

  return { report: lod.report, failedAt: lod.failedAt, retryVersion, resetVersion, onLod, onReset, onRetry };
}
