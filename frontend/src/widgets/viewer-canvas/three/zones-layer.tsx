import { memo, useMemo } from "react";
import { Html } from "@react-three/drei";
import { DoubleSide } from "three";
import { zoneCentre, type Zone } from "@/entities/zone";

interface ZonesLayerProps {
  zones: Zone[];
  /** Metres per scene unit: the lift above the ground is 0.1 m. */
  unitRatio: number;
  color: string;
  /** False outside plain orbit: a zone then answers no click and no ray. */
  interactive: boolean;
  selectedId: number | null;
  onSelect: (id: number | null) => void;
}

const LIFT_M = 0.1;
const FILL_OPACITY = 0.25;
const SELECTED_OPACITY = 0.45;
// Two triangles over the corners in drawing order.
const FILL_INDEX = new Uint16Array([0, 1, 2, 0, 2, 3]);
const noRaycast = () => undefined;

function ZoneShape({
  zone,
  color,
  interactive,
  selected,
  onSelect,
}: {
  zone: Zone;
  color: string;
  interactive: boolean;
  selected: boolean;
  onSelect: (id: number) => void;
}) {
  const positions = useMemo(() => new Float32Array(zone.corners.flatMap((c) => [c.x, c.y, c.z])), [zone.corners]);
  const centre = zoneCentre(zone);
  return (
    <group>
      <mesh
        raycast={interactive ? undefined : noRaycast}
        onClick={
          interactive
            ? (e) => {
                e.stopPropagation();
                onSelect(zone.id);
              }
            : undefined
        }
      >
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
          <bufferAttribute attach="index" args={[FILL_INDEX, 1]} />
        </bufferGeometry>
        <meshBasicMaterial
          color={color}
          transparent
          depthWrite={false}
          opacity={selected ? SELECTED_OPACITY : FILL_OPACITY}
          side={DoubleSide}
        />
      </mesh>
      <lineLoop raycast={noRaycast}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        </bufferGeometry>
        <lineBasicMaterial color={color} />
      </lineLoop>
      <Html position={[centre.x, centre.y, centre.z]} center style={{ pointerEvents: "none" }}>
        <span className="whitespace-nowrap rounded-[5px] border border-line-2 bg-panel/90 px-1.5 py-0.5 font-mono text-[11px] text-fg">
          {zone.title}
        </span>
      </Html>
    </group>
  );
}

/**
 * The site zones, drawn flat over the ground. Mounted outside the scene
 * wrapper on purpose: everything under it is solid to the walker and framed by
 * Bounds, and a zone is neither. The ray tests that matter (measure, place,
 * walk) never reach here; `interactive` only decides whether the zone's own
 * click and ray test exist.
 */
function ZonesLayerImpl({ zones, unitRatio, color, interactive, selectedId, onSelect }: ZonesLayerProps) {
  const lift = LIFT_M / (unitRatio > 0 ? unitRatio : 1);
  return (
    <group name="ZonesLayer" position={[0, lift, 0]}>
      {zones.map((zone) => (
        <ZoneShape
          key={zone.id}
          zone={zone}
          color={color}
          interactive={interactive}
          selected={zone.id === selectedId}
          onSelect={onSelect}
        />
      ))}
    </group>
  );
}

export default memo(ZonesLayerImpl);
