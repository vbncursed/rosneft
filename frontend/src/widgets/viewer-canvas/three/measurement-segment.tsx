import { memo, useCallback, useMemo } from "react";
import { Vector3 } from "three";
import { Html, Line } from "@react-three/drei";
import { decodeSegmentId, formatDistance, type Measurement } from "@/entities/measurement";
import { Icon } from "@/shared/ui/icon";

interface MeasurementSegmentProps {
  measurement: Measurement;
  unitRatio: number;
  /** The scene's accent, read from the theme tokens — three takes no CSS vars. */
  lineColor: string;
  /** False on a chain that offers no remove affordance: the chip is then a plain label. */
  removable: boolean;
  onRemoveSegment: (chainId: number, segmentIndex: number) => void;
  onRemoveChain: (chainId: number) => void;
}

// Render order high enough to draw on top of opaque scene meshes when
// depthTest is off — measurement lines must read clearly even when they
// sit flush against a photogrammetry surface that would otherwise
// Z-fight with them.
const OVERLAY_RENDER_ORDER = 999;

const CHIP =
  "flex select-none items-center gap-1 whitespace-nowrap rounded-[6px] border border-accent bg-panel px-2 py-1 font-mono text-[11px] text-accent shadow-elevation";

function MeasurementSegmentImpl({
  measurement,
  unitRatio,
  lineColor,
  removable,
  onRemoveSegment,
  onRemoveChain,
}: MeasurementSegmentProps) {
  // measurement.id encodes (chainId, segmentIndex) — see entities/measurement.
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
        color={lineColor}
        lineWidth={2.5}
        depthTest={false}
        depthWrite={false}
        renderOrder={OVERLAY_RENDER_ORDER}
      />
      <Html
        position={labelPos}
        center
        zIndexRange={[20, 10]}
        style={{ transform: "translate(-50%, calc(-100% - 12px))" }}
      >
        {removable ? (
          <button
            type="button"
            onClick={handleRemoveSegment}
            title="Click to remove segment · Shift+click to remove whole chain"
            className={`${CHIP} cursor-pointer transition-[color,border-color,scale] duration-150 ease-out hover:border-bad hover:text-bad active:scale-[0.97]`}
          >
            <span>{label}</span>
            <Icon name="close" size={11} />
          </button>
        ) : (
          <span className={CHIP}>{label}</span>
        )}
      </Html>
    </group>
  );
}

export default memo(MeasurementSegmentImpl);
