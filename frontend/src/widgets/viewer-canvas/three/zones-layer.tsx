import { memo, useMemo } from "react";
import { Html } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import { DoubleSide, Mesh, type Object3D } from "three";
import { zoneCentre, type Zone } from "@/entities/zone";
import { CLICK_SLOP_PX } from "../model/free-cam";
import { prismGeometry, zoneHeight, zoneOfTriangle, type PrismGeometry } from "./zone-prism-geometry";

interface ZonesLayerProps {
  zones: Zone[];
  /** Metres per scene unit: the lift above the ground is 0.1 m and the prism is 3 m tall. */
  unitRatio: number;
  color: string;
  /** False outside plain orbit: a zone then answers no click and no ray. */
  interactive: boolean;
  selectedId: number | null;
  onSelect: (id: number | null) => void;
}

const LIFT_M = 0.1;
const FILL_OPACITY = 0.2;
const SELECTED_OPACITY = 0.45;
const EDGE_OPACITY = 0.9;
const noRaycast = () => undefined;

const isPlacement = (o: Object3D | null): boolean =>
  o !== null && (o.userData.placementId !== undefined || isPlacement(o.parent));

/**
 * A placement standing inside the prism, or in front of its far side, takes
 * the click: the zone's walls are nearer than the object in them, and without
 * this nothing under a zone could be picked. One behind the prism does not.
 */
function placementInside(e: ThreeEvent<MouseEvent>): boolean {
  const own = e.intersections.filter((i) => i.object === e.object);
  const exit = Math.max(...own.map((i) => i.distance));
  return e.intersections.some((i) => isPlacement(i.object) && i.distance < exit);
}

const Faces = ({ g }: { g: PrismGeometry }) => (
  <bufferGeometry>
    <bufferAttribute attach="attributes-position" args={[g.positions, 3]} />
    <bufferAttribute attach="index" args={[g.faces, 1]} />
  </bufferGeometry>
);

function ZoneLabel({ zone, height }: { zone: Zone; height: number }) {
  const c = zoneCentre(zone);
  return (
    <Html position={[c.x, c.y + height, c.z]} center style={{ pointerEvents: "none" }}>
      <span className="whitespace-nowrap rounded-[5px] border border-line-2 bg-panel/90 px-1.5 py-0.5 font-mono text-[11px] text-fg">
        {zone.title}
      </span>
    </Html>
  );
}

/**
 * The site zones, drawn as translucent prisms: each footprint raised by the
 * fixed zone height, so one reads from any orbit angle and a click lands on a
 * wall, not on a sliver of ground the terrain may cover. One merged mesh and one
 * merged outline for all of them. Mounted outside the scene wrapper on
 * purpose: everything under it is solid to the walker and framed by Bounds, and
 * a zone is neither. The ray tests that matter (measure, place, walk) never
 * reach here; `interactive` only decides whether the zone's own click and ray
 * test exist.
 */
function ZonesLayerImpl({ zones, unitRatio, color, interactive, selectedId, onSelect }: ZonesLayerProps) {
  const height = zoneHeight(unitRatio);
  const lift = LIFT_M / (unitRatio > 0 ? unitRatio : 1);
  const all = useMemo(
    () =>
      prismGeometry(
        zones.map((z) => z.corners),
        height,
      ),
    [zones, height],
  );
  const picked = zones.find((z) => z.id === selectedId) ?? null;
  const pickedGeometry = useMemo(() => (picked ? prismGeometry([picked.corners], height) : null), [picked, height]);

  if (zones.length === 0) return null;
  return (
    <group name="ZonesLayer" position={[0, lift, 0]}>
      <mesh
        name="ZoneFaces"
        frustumCulled={false}
        // Never `undefined`: R3F skips undefined props, so a mesh switched to no-op would stay that way.
        // oxlint-disable-next-line typescript/unbound-method -- handed to three as the mesh's own raycast, called with the mesh as `this`
        raycast={interactive ? Mesh.prototype.raycast : noRaycast}
        // Always a handler, for the same reason: it only fires when the ray test can hit.
        onClick={(e) => {
          // A press that travelled is an orbit, not a pick.
          if (!interactive || e.delta >= CLICK_SLOP_PX || placementInside(e)) return;
          const zone = zones[zoneOfTriangle(e.faceIndex ?? 0)];
          if (!zone) return;
          e.stopPropagation();
          onSelect(zone.id);
        }}
      >
        <Faces g={all} />
        <meshBasicMaterial color={color} transparent depthWrite={false} opacity={FILL_OPACITY} side={DoubleSide} />
      </mesh>
      {pickedGeometry ? (
        <mesh name="ZoneSelected" raycast={noRaycast} frustumCulled={false}>
          <Faces g={pickedGeometry} />
          <meshBasicMaterial
            color={color}
            transparent
            depthWrite={false}
            opacity={SELECTED_OPACITY}
            side={DoubleSide}
          />
        </mesh>
      ) : null}
      <lineSegments raycast={noRaycast} frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[all.positions, 3]} />
          <bufferAttribute attach="index" args={[all.edges, 1]} />
        </bufferGeometry>
        <lineBasicMaterial color={color} transparent opacity={EDGE_OPACITY} depthWrite={false} />
      </lineSegments>
      {zones.map((zone) => (
        <ZoneLabel key={zone.id} zone={zone} height={height} />
      ))}
    </group>
  );
}

export default memo(ZonesLayerImpl);
