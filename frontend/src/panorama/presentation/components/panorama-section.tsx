import { type RefObject } from "react";
import { useCan } from "@/auth/presentation/current-user-context";
import type { Panorama } from "@/panorama/domain/panorama";
import type { Document } from "@/document/domain/document";
import type { Vec3 } from "@/shared/domain/vec3";
import type { usePanoramaOrchestration } from "@/panorama/application/use-panorama-orchestration";
import type { usePanoramaCalibration } from "@/panorama/application/use-panorama-calibration";
import PanoramaPicker from "@/panorama/presentation/components/panorama-picker";
import PanoramaEditPanel from "@/panorama/presentation/components/panorama-edit-panel";
import PanoramaCalibrationPanel from "@/panorama/presentation/components/panorama-calibration-panel";
import ExternalPanoramaControl from "@/panorama/presentation/components/external-panorama-control";

interface PanoramaSectionProps {
  territorySlug: string;
  panorama: ReturnType<typeof usePanoramaOrchestration>;
  panoramas: Panorama[];
  // The View dropdown also lists documents; selecting one shows the PDF in
  // place of the scene (handled by the parent).
  documents: Document[];
  activeDocumentId: number | null;
  onActivatePanorama: (id: number | null) => void;
  onActivateDocument: (id: number) => void;
  cameraPositionRef: RefObject<Vec3 | null>;
  externalPanoramaUrl?: string;
  // Ids whose equirect texture failed to load — the edit panel flags them
  // so the operator knows to delete and re-upload.
  failedPanoramaIds: ReadonlySet<number>;
  calibration: ReturnType<typeof usePanoramaCalibration>;
  // Whether the in-scene panorama markers (clickable points in 3D) are shown.
  markersVisible: boolean;
  onToggleMarkers: () => void;
  // Panorama "Move" mode: drag markers on the mesh. Toggled here; gated on
  // panorama:write (same as the other edit affordances in this section).
  moveMode: boolean;
  onToggleMove: () => void;
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
  documents,
  activeDocumentId,
  onActivatePanorama,
  onActivateDocument,
  cameraPositionRef,
  externalPanoramaUrl,
  failedPanoramaIds,
  calibration,
  markersVisible,
  onToggleMarkers,
  moveMode,
  onToggleMove,
  onSavePanorama,
  onDeletePanorama,
}: PanoramaSectionProps) {
  const {
    activePanorama,
    activePanoramaId,
    editingPanorama,
    toggleView,
    closeEdit,
  } = panorama;
  const inPanoramaMode =
    editingPanorama != null && activePanoramaId === editingPanorama.id;

  const can = useCan();
  const canWrite = can("panorama:write");
  const canDelete = can("panorama:delete");
  // The external tour URL lives on the territory, so it follows territory:write.
  const canEditLink = can("territory:write");
  const canWriteDoc = can("document:write");

  return (
    <div className="flex flex-col gap-3">
      <PanoramaPicker
        panoramas={panoramas}
        documents={documents}
        activePanoramaId={activePanorama?.id ?? null}
        activeDocumentId={activeDocumentId}
        onActivatePanorama={onActivatePanorama}
        onActivateDocument={onActivateDocument}
      />

      {panoramas.length > 0 ? (
        <button
          type="button"
          onClick={onToggleMarkers}
          aria-pressed={!markersVisible}
          className="cursor-pointer rounded-md border border-white/15 px-3 py-1.5 text-[11px] text-neutral-200 transition-colors hover:border-cyan-400/60 hover:text-cyan-200"
        >
          {markersVisible ? "Hide panorama points" : "Show panorama points"}
        </button>
      ) : null}

      {canWrite && panoramas.length > 0 ? (
        <button
          type="button"
          onClick={onToggleMove}
          aria-pressed={moveMode}
          title="Drag panorama points on the model (V)"
          className={`flex cursor-pointer items-center justify-center gap-2 rounded-md border px-3 py-1.5 text-[11px] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 ${
            moveMode
              ? "border-cyan-300/60 bg-cyan-500/15 text-cyan-100 hover:bg-cyan-500/20"
              : "border-white/15 text-neutral-200 hover:border-cyan-400/60 hover:text-cyan-200"
          }`}
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            width="14"
            height="14"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 3v18M3 12h18M12 3l-2.5 2.5M12 3l2.5 2.5M12 21l-2.5-2.5M12 21l2.5-2.5M3 12l2.5-2.5M3 12l2.5 2.5M21 12l-2.5-2.5M21 12l-2.5 2.5" />
          </svg>
          <span>{moveMode ? "Moving points" : "Move points"}</span>
          <kbd className="rounded border border-current/40 px-1 text-[10px] opacity-70">
            V
          </kbd>
        </button>
      ) : null}

      <ExternalPanoramaControl
        territorySlug={territorySlug}
        initialUrl={externalPanoramaUrl}
        canEdit={canEditLink}
      />

      {canWrite ? (
        <a
          href={`/territories/${encodeURIComponent(territorySlug)}/panoramas/new`}
          className="cursor-pointer text-[10px] uppercase tracking-wider text-cyan-300/80 transition-colors hover:text-cyan-200"
        >
          + Panorama
        </a>
      ) : null}

      {canWriteDoc ? (
        <a
          href={`/territories/${encodeURIComponent(territorySlug)}/documents/new`}
          className="cursor-pointer text-[10px] uppercase tracking-wider text-cyan-300/80 transition-colors hover:text-cyan-200"
        >
          + Document
        </a>
      ) : null}

      {editingPanorama && calibration.calibrating && calibration.draft ? (
        <PanoramaCalibrationPanel
          panorama={editingPanorama}
          draft={calibration.draft}
          opacity={calibration.opacity}
          onNudge={calibration.nudge}
          onSetYaw={calibration.setYaw}
          onSetOpacity={calibration.setOpacity}
          onSave={calibration.save}
          onExit={calibration.cancel}
        />
      ) : editingPanorama ? (
        <PanoramaEditPanel
          // Re-key on position too, not just id: a "Move points" drag commits
          // a new position onto this same panorama. Without it the panel keeps
          // its stale seeded position, so Save anchor would revert the drag.
          key={`${editingPanorama.id}:${editingPanorama.position.x},${editingPanorama.position.y},${editingPanorama.position.z}`}
          panorama={editingPanorama}
          cameraPositionRef={cameraPositionRef}
          inPanoramaMode={inPanoramaMode}
          failed={failedPanoramaIds.has(editingPanorama.id)}
          canWrite={canWrite}
          canDelete={canDelete}
          onSave={(patch) => onSavePanorama(editingPanorama.id, patch)}
          onToggleView={toggleView}
          onClose={closeEdit}
          onDelete={() => onDeletePanorama(editingPanorama.id)}
          onCalibrate={calibration.start}
        />
      ) : null}
    </div>
  );
}
