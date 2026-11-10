import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CalibrationPair, Pt } from "@/entities/site-plan";
import { runRegistration, type Ground } from "@/widgets/viewer-canvas";

type Alignment = {
  pairs: CalibrationPair[];
  imageProposalAllowed: boolean;
  pending: Pt | null;
  proposeImagePairs: (expected: CalibrationPair[], proposal: CalibrationPair[]) => void;
};

type Params = {
  image: ImageBitmap | null;
  pageSize: { width: number; height: number } | null;
  page: number;
  source: string;
  savedPage: number | null;
  ground: Ground;
  unitRatio: number;
  alignment: Alignment;
};

/** Proposes image-based pairs once per page picture without replacing edits or saved pairs. */
export function useImageAlignment(p: Params): "matching" | "matched" | "unavailable" | null {
  const [status, setStatus] = useState<"matching" | "matched" | "unavailable" | null>(null);
  const latest = useRef(p.alignment);
  useLayoutEffect(() => {
    latest.current = p.alignment;
  }, [p.alignment]);
  const width = p.pageSize?.width,
    height = p.pageSize?.height;
  useEffect(() => {
    if (!p.source || !p.image || !width || !height || p.savedPage === p.page || !latest.current.imageProposalAllowed) {
      setStatus(null);
      return;
    }
    const controller = new AbortController(),
      expected = latest.current.pairs;
    setStatus("matching");
    void runRegistration(p.image, { width, height }, p.ground, p.unitRatio, controller.signal).then((pairs) => {
      if (controller.signal.aborted) return;
      const current = latest.current;
      if (current.pairs !== expected || current.pending) {
        setStatus(null);
        return;
      }
      if (pairs.length) {
        current.proposeImagePairs(expected, pairs);
        setStatus("matched");
      } else setStatus("unavailable");
    });
    return () => controller.abort();
  }, [p.image, width, height, p.page, p.source, p.savedPage, p.ground, p.unitRatio]);
  return status;
}
