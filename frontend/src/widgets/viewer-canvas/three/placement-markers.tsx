import { Html } from "@react-three/drei";
import type { Placement } from "@/entities/placement";

interface PlacementMarkersProps {
  placements: Placement[];
  /** `storage-tank-500 #1` by placement id — the same name the panel shows. */
  labels: Record<number, string>;
}

// PlacementMarkers names the equipment a reader is looking at inside a
// panorama. The 3D view has the panel and the gizmo; a panorama has neither,
// so the ring plus its name is the whole affordance — and there is nothing to
// click, which is why this is a span and not a button. Tokens colour it: this
// is DOM inside drei <Html>, not three.
//
// A placement with no label is skipped rather than drawn bare: an unnamed ring
// floating in a photo tells the reader nothing it did not already know.
export default function PlacementMarkers({ placements, labels }: PlacementMarkersProps) {
  return (
    <>
      {placements.map((p) => {
        const label = labels[p.id];
        if (!label) return null;
        return (
          <Html key={p.id} position={[p.position.x, p.position.y, p.position.z]} center zIndexRange={[20, 10]}>
            <div className="relative pointer-events-none">
              <span className="block size-2.5 rounded-full border-2 border-accent bg-panel" />
              <span className="absolute -top-1.5 left-3.5 whitespace-nowrap font-mono text-[10px] text-accent">
                {label}
              </span>
            </div>
          </Html>
        );
      })}
    </>
  );
}
