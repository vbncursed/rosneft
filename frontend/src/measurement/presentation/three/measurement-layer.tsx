import { memo, useEffect } from "react";
import { useThree } from "@react-three/fiber";
import { type Chain, chainSegments } from "@/measurement/domain/chain";
import MeasurementSegment from "@/measurement/presentation/three/measurement-segment";
import PointMarker from "@/measurement/presentation/three/point-marker";

interface MeasurementLayerProps {
  chains: Chain[];
  activeChainId: number | null;
  unitRatio: number;
  onCloseActive: () => void;
  onRemoveSegment: (chainId: number, segmentIndex: number) => void;
  onRemoveChain: (chainId: number) => void;
}

// MeasurementLayer renders every chain in the scene. For each chain it
// emits one Line+label per derived segment plus a marker per vertex.
// The first vertex of the active chain is rendered with the
// "active-start" variant — clicking it closes the chain into a loop.
//
// Memoed so unrelated re-renders of ModelViewer (selection, hover,
// gizmo drag) don't reconcile every segment.
function MeasurementLayerImpl({
  chains,
  activeChainId,
  unitRatio,
  onCloseActive,
  onRemoveSegment,
  onRemoveChain,
}: MeasurementLayerProps) {
  const invalidate = useThree((state) => state.invalidate);

  // Canvas runs in frameloop="demand". Html children update the DOM on
  // unmount synchronously, but lines live in WebGL — they only clear
  // when a new frame is drawn. Force an invalidate on every chain
  // change so Clear, segment removal, and chain removal always paint.
  useEffect(() => {
    invalidate();
  }, [chains, invalidate]);

  return (
    <>
      {chains.map((chain) => {
        const segments = chainSegments(chain);
        const isActive = chain.id === activeChainId;
        return (
          <group key={chain.id}>
            {segments.map((segment) => (
              <MeasurementSegment
                key={segment.id}
                measurement={segment}
                unitRatio={unitRatio}
                onRemoveSegment={onRemoveSegment}
                onRemoveChain={onRemoveChain}
              />
            ))}
            {chain.points.map((p, idx) => {
              // Active chain's first vertex (when there are at least
              // two points to close into a loop) becomes the closer.
              const isCloser =
                isActive && idx === 0 && chain.points.length >= 2 && !chain.closed;
              return (
                <PointMarker
                  key={idx}
                  position={p}
                  variant={isCloser ? "active-start" : "passive"}
                  onClick={isCloser ? onCloseActive : undefined}
                />
              );
            })}
          </group>
        );
      })}
    </>
  );
}

export default memo(MeasurementLayerImpl);
