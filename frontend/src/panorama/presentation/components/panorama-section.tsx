import { type RefObject } from "react";
import type { Panorama } from "@/panorama/domain/panorama";
import type { Vec3 } from "@/shared/domain/vec3";
import type { usePanoramaOrchestration } from "@/panorama/application/use-panorama-orchestration";
import PanoramaPicker from "@/panorama/presentation/components/panorama-picker";
import PanoramaEditPanel from "@/panorama/presentation/components/panorama-edit-panel";
import ExternalPanoramaControl from "@/panorama/presentation/components/external-panorama-control";

interface PanoramaSectionProps {
  territorySlug: string;
  panorama: ReturnType<typeof usePanoramaOrchestration>;
  panoramas: Panorama[];
  cameraPositionRef: RefObject<Vec3 | null>;
  externalPanoramaUrl?: string;
  // Ids whose equirect texture failed to load — the edit panel flags them
  // so the operator knows to delete and re-upload.
  failedPanoramaIds: ReadonlySet<number>;
  onSavePanorama: (
    id: number,
    patch: { position?: Vec3; yawOffset?: number },
  ) => void;
  onDeletePanorama: (id: number) => Promise<void>;
}

// PanoramaSection is the body of the overlays panel's "View" tab. It gathers
// every view-switching affordance that used to float separately in the right
// rail: the 3D/panorama picker, the "+ Panorama" upload link, the external
// panorama-tour link (with inline editing), and — once a panorama is being
// calibrated — the anchor edit panel.
export default function PanoramaSection({
  territorySlug,
  panorama,
  panoramas,
  cameraPositionRef,
  externalPanoramaUrl,
  failedPanoramaIds,
  onSavePanorama,
  onDeletePanorama,
}: PanoramaSectionProps) {
  const {
    activePanorama,
    activePanoramaId,
    editingPanorama,
    activate,
    toggleView,
    closeEdit,
  } = panorama;
  const inPanoramaMode =
    editingPanorama != null && activePanoramaId === editingPanorama.id;

  return (
    <div className="flex flex-col gap-3">
      <PanoramaPicker
        panoramas={panoramas}
        activeId={activePanorama?.id ?? null}
        onActivate={activate}
      />

      <ExternalPanoramaControl
        territorySlug={territorySlug}
        initialUrl={externalPanoramaUrl}
      />

      <a
        href={`/territories/${encodeURIComponent(territorySlug)}/panoramas/new`}
        className="cursor-pointer text-[10px] uppercase tracking-wider text-cyan-300/80 transition-colors hover:text-cyan-200"
      >
        + Panorama
      </a>

      {editingPanorama ? (
        <PanoramaEditPanel
          key={editingPanorama.id}
          panorama={editingPanorama}
          cameraPositionRef={cameraPositionRef}
          inPanoramaMode={inPanoramaMode}
          failed={failedPanoramaIds.has(editingPanorama.id)}
          onSave={(patch) => onSavePanorama(editingPanorama.id, patch)}
          onToggleView={toggleView}
          onClose={closeEdit}
          onDelete={() => onDeletePanorama(editingPanorama.id)}
        />
      ) : null}
    </div>
  );
}
