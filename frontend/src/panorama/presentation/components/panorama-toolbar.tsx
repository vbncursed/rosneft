import { type RefObject } from "react";
import type { Panorama } from "@/panorama/domain/panorama";
import type { Vec3 } from "@/shared/domain/vec3";
import PanoramaPicker from "@/panorama/presentation/components/panorama-picker";
import PanoramaEditPanel from "@/panorama/presentation/components/panorama-edit-panel";

interface PanoramaToolbarProps {
  territorySlug: string;
  panoramas: Panorama[];
  activeId: number | null;
  editingPanorama: Panorama | null;
  inPanoramaMode: boolean;
  cameraPositionRef: RefObject<Vec3 | null>;
  onActivate: (id: number | null) => void;
  onSavePanorama: (
    id: number,
    patch: { position?: Vec3; yawOffset?: number },
  ) => void;
  onToggleView: () => void;
  onCloseEdit: () => void;
}

// PanoramaToolbar is the right-edge cluster of panorama-related UI: the
// picker, the "+ Panorama" upload link, and the calibration panel that
// appears once an entry is selected. Lifted out of ModelViewer so its
// JSX doesn't crowd the top-level composition.
export default function PanoramaToolbar({
  territorySlug,
  panoramas,
  activeId,
  editingPanorama,
  inPanoramaMode,
  cameraPositionRef,
  onActivate,
  onSavePanorama,
  onToggleView,
  onCloseEdit,
}: PanoramaToolbarProps) {
  return (
    <>
      <div className="pointer-events-auto flex items-center gap-3 rounded-md border border-white/10 bg-neutral-900/85 px-3 py-2 backdrop-blur">
        <PanoramaPicker
          panoramas={panoramas}
          activeId={activeId}
          onActivate={onActivate}
        />
        <a
          href={`/territories/${encodeURIComponent(territorySlug)}/panoramas/new`}
          className="cursor-pointer text-[10px] uppercase tracking-wider text-cyan-300/80 transition-colors hover:text-cyan-200"
        >
          + Panorama
        </a>
      </div>
      {editingPanorama ? (
        <PanoramaEditPanel
          key={editingPanorama.id}
          panorama={editingPanorama}
          cameraPositionRef={cameraPositionRef}
          inPanoramaMode={inPanoramaMode}
          onSave={(patch) => onSavePanorama(editingPanorama.id, patch)}
          onToggleView={onToggleView}
          onClose={onCloseEdit}
        />
      ) : null}
    </>
  );
}
