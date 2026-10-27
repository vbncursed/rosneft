import { memo, useEffect, useMemo } from "react";
import { Html } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import { BufferAttribute, BufferGeometry, DoubleSide, Mesh, Raycaster, type Object3D } from "three";
import { zoneCentre, type Zone } from "@/entities/zone";
import { CLICK_SLOP_PX } from "../model/free-cam";
import { pickZone, type RayHit } from "./zone-pick";
import { prismGeometry, zoneHeight } from "./zone-prism-geometry";

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
const NONE_F = new Float32Array(0);
const NONE_I = new Uint32Array(0);

const isPlacement = (o: Object3D | null): boolean =>
  o !== null && (o.userData.placementId !== undefined || isPlacement(o.parent));

/**
 * R3F keeps one hit per object, so a prism shows up in `intersections` as its nearest wall only. The
 * whole crossing (every wall the ray meets) is the mesh's own raycast against the event's ray.
 */
function crossing(e: ThreeEvent<MouseEvent>): RayHit[] {
  const caster = new Raycaster();
  caster.ray.copy(e.ray);
  return caster
    .intersectObject(e.object, false)
    .flatMap((h) => (h.faceIndex == null ? [] : [{ faceIndex: h.faceIndex, distance: h.distance }]));
}

/** A placement between the prism's near wall and its far one takes the click: it stands inside the zone. */
const placementInside = (e: ThreeEvent<MouseEvent>, exit: number) =>
  e.intersections.some((i) => isPlacement(i.object) && i.distance < exit);

/**
 * A geometry of its own per set of arrays, disposed when they change. Reusing one geometry and swapping
 * its attributes keeps three's cached bounding sphere, and a zone added outside it would never be hit.
 */
function useGeometry(positions: Float32Array, index: Uint32Array) {
  const geometry = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(positions, 3));
    g.setIndex(new BufferAttribute(index, 1));
    return g;
  }, [positions, index]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return geometry;
}

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
  const pickedPrism = useMemo(() => (picked ? prismGeometry([picked.corners], height) : null), [picked, height]);
  const faces = useGeometry(all.positions, all.faces);
  const edges = useGeometry(all.positions, all.edges);
  const selected = useGeometry(pickedPrism?.positions ?? NONE_F, pickedPrism?.faces ?? NONE_I);

  if (zones.length === 0) return null;
  return (
    <group name="ZonesLayer" position={[0, lift, 0]}>
      <mesh
        name="ZoneFaces"
        geometry={faces}
        frustumCulled={false}
        // Never `undefined`: R3F skips undefined props, so a mesh switched to no-op would stay that way.
        // oxlint-disable-next-line typescript/unbound-method -- handed to three as the mesh's own raycast, called with the mesh as `this`
        raycast={interactive ? Mesh.prototype.raycast : noRaycast}
        // Always a handler, for the same reason: it only fires when the ray test can hit.
        onClick={(e) => {
          // A press that travelled is an orbit, not a pick.
          if (!interactive || e.delta >= CLICK_SLOP_PX) return;
          const target = pickZone(crossing(e), zones);
          if (!target || placementInside(e, target.exit)) return;
          e.stopPropagation();
          onSelect(zones[target.index].id);
        }}
      >
        <meshBasicMaterial color={color} transparent depthWrite={false} opacity={FILL_OPACITY} side={DoubleSide} />
      </mesh>
      {pickedPrism ? (
        <mesh name="ZoneSelected" geometry={selected} raycast={noRaycast} frustumCulled={false}>
          <meshBasicMaterial
            color={color}
            transparent
            depthWrite={false}
            opacity={SELECTED_OPACITY}
            side={DoubleSide}
          />
        </mesh>
      ) : null}
      <lineSegments geometry={edges} raycast={noRaycast} frustumCulled={false}>
        <lineBasicMaterial color={color} transparent opacity={EDGE_OPACITY} depthWrite={false} />
      </lineSegments>
      {zones.map((zone) => (
        <ZoneLabel key={zone.id} zone={zone} height={height} />
      ))}
    </group>
  );
}

export default memo(ZonesLayerImpl);
