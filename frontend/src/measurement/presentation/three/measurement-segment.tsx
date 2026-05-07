import { memo, useCallback, useMemo } from "react";
import { Vector3 } from "three";
import { Html, Line } from "@react-three/drei";
import { decodeSegmentId } from "@/measurement/domain/chain";
import type { Measurement } from "@/measurement/domain/measurement";
import { formatDistance } from "@/measurement/domain/distance";

interface MeasurementSegmentProps {
  measurement: Measurement;
  unitRatio: number;
  onRemoveSegment: (chainId: number, segmentIndex: number) => void;
  onRemoveChain: (chainId: number) => void;
}

const LINE_COLOR = "#67e8f9";

// Render order high enough to draw on top of opaque scene meshes when
// depthTest is off — measurement lines must read clearly even when they
// sit flush against a photogrammetry surface that would otherwise
// Z-fight with them.
const OVERLAY_RENDER_ORDER = 999;

function MeasurementSegmentImpl({
  measurement,
  unitRatio,
  onRemoveSegment,
  onRemoveChain,
}: MeasurementSegmentProps) {
  // measurement.id encodes (chainId, segmentIndex) — see domain/chain.
  // Decoding here keeps the presentation layer's contract simple: it
  // gets a Measurement and knows how to talk back.
  const { chainId, segmentIndex } = useMemo(
    () => decodeSegmentId(measurement.id),
    [measurement.id],
  );

  const { points, midpoint, distance } = useMemo(() => {
    const a = new Vector3(measurement.a.x, measurement.a.y, measurement.a.z);
    const b = new Vector3(measurement.b.x, measurement.b.y, measurement.b.z);
    return {
      points: [a, b] as [Vector3, Vector3],
      midpoint: a.clone().add(b).multiplyScalar(0.5),
      distance: a.distanceTo(b),
    };
  }, [measurement.a, measurement.b]);

  const label = useMemo(
    () => formatDistance(distance * unitRatio, unitRatio),
    [distance, unitRatio],
  );

  const labelPos = useMemo<[number, number, number]>(
    () => [midpoint.x, midpoint.y, midpoint.z],
    [midpoint],
  );

  const handleRemoveSegment = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      // Shift-click removes the whole chain instead of just this
      // segment. Discoverable through the title attribute.
      if (event.shiftKey) {
        onRemoveChain(chainId);
        return;
      }
      onRemoveSegment(chainId, segmentIndex);
    },
    [chainId, segmentIndex, onRemoveSegment, onRemoveChain],
  );

  return (
    <group>
      <Line
        points={points}
        color={LINE_COLOR}
        lineWidth={2.5}
        depthTest={false}
        depthWrite={false}
        renderOrder={OVERLAY_RENDER_ORDER}
        transparent
      />
      <Html
        position={labelPos}
        center
        zIndexRange={[20, 10]}
        style={{ transform: "translate(-50%, calc(-100% - 12px))" }}
      >
        <button
          type="button"
          onClick={handleRemoveSegment}
          title="Click to remove segment · Shift+click to remove whole chain"
          className="group flex select-none cursor-pointer items-center gap-1 rounded-md border border-cyan-300/40 bg-black/80 px-2 py-0.5 text-[10px] font-medium leading-tight text-cyan-100 shadow-md backdrop-blur-sm transition-colors hover:bg-red-950/80 hover:text-red-100 hover:border-red-300/60"
        >
          <span>{label}</span>
          <span
            aria-hidden="true"
            className="text-cyan-300/70 transition-colors group-hover:text-red-200"
          >
            ×
          </span>
        </button>
      </Html>
    </group>
  );
}

export default memo(MeasurementSegmentImpl);
