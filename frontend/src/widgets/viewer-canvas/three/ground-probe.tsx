import { useFrame } from "@react-three/fiber";
import { useRef, type RefObject } from "react";
import { Box3, type Object3D } from "three";
import { raycastSurfaceY } from "./snap-to-surface";

/** What the page needs to put a zone on the ground: the height under a point, and a stand-in where there is none. */
export type Ground = {
  groundAt: (x: number, z: number) => number | null;
  /** The territory's median ground height. */
  fallbackY: number;
};

interface GroundProbeProps {
  /** The territory's own group: placements sit on it and a roof is not ground. */
  root: RefObject<Object3D | null>;
  onReady: (ground: Ground) => void;
}

/** Samples per side over the footprint. */
const GRID = 12;

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

function medianGround(root: Object3D, groundAt: Ground["groundAt"]): number {
  const box = new Box3().setFromObject(root);
  const heights: number[] = [];
  for (let i = 0; i < GRID; i++) {
    for (let j = 0; j < GRID; j++) {
      const x = box.min.x + ((i + 0.5) / GRID) * (box.max.x - box.min.x);
      const z = box.min.z + ((j + 0.5) / GRID) * (box.max.z - box.min.z);
      const y = groundAt(x, z);
      if (y !== null) heights.push(y);
    }
  }
  return heights.length ? median(heights) : (box.min.y + box.max.y) / 2;
}

/**
 * Hands the page `groundAt` once the territory has a mesh. It ray-tests the
 * territory group only, never the wrapper: a tank's roof is not the ground
 * a zone corner belongs on, and the zone layers sit outside it anyway.
 */
export default function GroundProbe({ root, onReady }: GroundProbeProps) {
  const done = useRef(false);
  // The mesh arrives with the download, long after mount; the frame it first
  // draws in is the first one that can see it.
  useFrame(() => {
    const group = root.current;
    if (done.current || !group) return;
    const box = new Box3().setFromObject(group);
    if (box.isEmpty()) return;
    done.current = true;
    const groundAt = (x: number, z: number) => (root.current ? raycastSurfaceY(root.current, x, z) : null);
    onReady({ groundAt, fallbackY: medianGround(group, groundAt) });
  });
  return null;
}
