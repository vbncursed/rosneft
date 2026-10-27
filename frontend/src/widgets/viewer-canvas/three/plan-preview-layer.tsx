import { memo, useEffect, useMemo } from "react";
import { Html } from "@react-three/drei";
import { DoubleSide, Mesh, type BufferGeometry } from "three";
import type { PreviewOutline } from "@/features/zone-editor";
import type { PlanPreview } from "../ui/props";
import { pickOutline } from "./pick-outline";
import { footprintsGeometry, loopGeometry, segmentsGeometry } from "./plan-preview-geometry";

interface PlanPreviewLayerProps {
  preview: PlanPreview;
  /** Metres per scene unit: the lift above the ground is 0.06 m, under a zone's 0.1 m. */
  unitRatio: number;
  color: string;
  /** False outside plain orbit, or while a plan point waits for the model: the layer then answers no click and no ray. */
  interactive: boolean;
}

// Under the zones' lift; the zones stand aside (not interactive) while this layer exists, so its click wins.
const LIFT_M = 0.06;
const LINE_OPACITY = 0.7;
const FOOTPRINT_OPACITY = 0.07;
const PICKED_OPACITY = 0.55;
// Above the plan picture and the zones, which sit at 0.
const ORDER = 2;
const noRaycast = () => undefined;

function useDisposed(geometry: BufferGeometry) {
  useEffect(() => () => geometry.dispose(), [geometry]);
  return geometry;
}

/** The picked rectangle: a bright loop, a stronger fill and its size, none of it hit by a ray. */
function Picked({ outline, label, color }: { outline: PreviewOutline; label: string | null; color: string }) {
  const loop = useDisposed(useMemo(() => loopGeometry(outline), [outline]));
  const fill = useDisposed(useMemo(() => footprintsGeometry([outline]), [outline]));
  const [x, y, z] = [0, 1, 2].map((k) => outline.corners.reduce((s, c) => s + [c.x, c.y, c.z][k], 0) / 4);
  return (
    <>
      <lineLoop geometry={loop} raycast={noRaycast} renderOrder={ORDER} frustumCulled={false}>
        <lineBasicMaterial color={color} transparent depthWrite={false} />
      </lineLoop>
      <mesh geometry={fill} raycast={noRaycast} renderOrder={ORDER} frustumCulled={false}>
        <meshBasicMaterial color={color} transparent opacity={PICKED_OPACITY} depthWrite={false} side={DoubleSide} />
      </mesh>
      {label ? (
        <Html position={[x, y, z]} center style={{ pointerEvents: "none" }}>
          <span className="inline-block -translate-y-6 whitespace-nowrap rounded-[5px] border border-line-2 bg-panel/90 px-1.5 py-0.5 font-mono text-[11px] text-fg">
            {label}
          </span>
        </Html>
      ) : null}
    </>
  );
}

/**
 * The detected plan rectangles as thin outlines on the ground, so the reader
 * sees where each candidate square would land before making it a zone. Mounted
 * beside the scene wrapper like the zones: never solid, never framed, never in
 * a measure or place ray. One merged line geometry, one merged footprint mesh.
 */
function PlanPreviewLayerImpl({ preview, unitRatio, color, interactive }: PlanPreviewLayerProps) {
  const { outlines, selected, label, onSelect } = preview;
  const lift = LIFT_M / (unitRatio > 0 ? unitRatio : 1);
  const lines = useDisposed(useMemo(() => segmentsGeometry(outlines), [outlines]));
  const feet = useDisposed(useMemo(() => footprintsGeometry(outlines), [outlines]));
  const picked = useMemo(() => outlines.find((o) => o.index === selected) ?? null, [outlines, selected]);

  return (
    <group name="PlanPreviewLayer" position={[0, lift, 0]}>
      <lineSegments geometry={lines} raycast={noRaycast} renderOrder={ORDER} frustumCulled={false}>
        <lineBasicMaterial color={color} transparent opacity={LINE_OPACITY} depthWrite={false} />
      </lineSegments>
      <mesh
        name="PlanPreviewFeet"
        geometry={feet}
        renderOrder={ORDER}
        frustumCulled={false}
        // Never `undefined`: R3F skips undefined props, so a mesh switched to no-op would stay that way.
        // oxlint-disable-next-line typescript/unbound-method -- handed to three as the mesh's own raycast, called with the mesh as `this`
        raycast={interactive ? Mesh.prototype.raycast : noRaycast}
        // Always a handler, for the same reason: it only fires when the ray test can hit.
        onClick={(e) => {
          // The merged mesh reports only its nearest triangle, which of two nested rectangles in one plane is arbitrary.
          const hit = interactive ? pickOutline(outlines, e.point) : null;
          if (hit === null) return;
          e.stopPropagation();
          onSelect(hit);
        }}
      >
        <meshBasicMaterial color={color} transparent opacity={FOOTPRINT_OPACITY} depthWrite={false} side={DoubleSide} />
      </mesh>
      {picked ? <Picked outline={picked} label={label} color={color} /> : null}
    </group>
  );
}

export default memo(PlanPreviewLayerImpl);
