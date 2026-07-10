import { type RefObject, useState } from "react";
import type { Panorama } from "@/panorama/domain/panorama";
import type { Vec3 } from "@/shared/domain/vec3";
import Vec3Field from "@/placement/presentation/components/vec3-field";
import QuantityStepper from "@/placement/presentation/components/quantity-stepper";
import DeleteButton from "@/shared/presentation/components/delete-button";

interface PanoramaEditPanelProps {
  panorama: Panorama;
  // Live camera position from the Canvas. Read on demand when the user
  // clicks "Set from camera".
  cameraPositionRef: RefObject<Vec3 | null>;
  // True when the camera is currently locked inside this panorama —
  // "Set from camera" can't help there, so it's disabled.
  inPanoramaMode: boolean;
  // True when this panorama's equirect texture failed to load — its
  // calibration controls are useless, so we surface a fix-it hint and the
  // delete action instead.
  failed: boolean;
  // Permission flags: write gates the anchor/calibration editing controls,
  // delete gates the delete action. Viewing a panorama stays open to everyone.
  canWrite: boolean;
  canDelete: boolean;
  onSave: (patch: { position?: Vec3; yawOffset?: number }) => void;
  onToggleView: () => void;
  onClose: () => void;
  onDelete: () => Promise<void>;
  onCalibrate: () => void;
}

const TAU = Math.PI * 2;
const RAD_TO_DEG = 180 / Math.PI;

// PanoramaEditPanel exposes the two calibration knobs the operator
// needs to make a 360° capture line up with the territory mesh:
//   • position — point on the territory where the camera was when the
//     equirect was shot. Anything placed near this point in 3D will
//     appear at its true visual location in the panorama.
//   • yawOffset — rotation around Y that aligns the equirect's implicit
//     "north" with the territory's +Z axis.
//
// "Set from camera" lifts the current 3D-view camera position straight
// into the panorama anchor — pose the camera in 3D where the photo was
// taken, click the button, save.
export default function PanoramaEditPanel({
  panorama,
  cameraPositionRef,
  inPanoramaMode,
  failed,
  canWrite,
  canDelete,
  onSave,
  onToggleView,
  onClose,
  onDelete,
  onCalibrate,
}: PanoramaEditPanelProps) {
  // Re-key on panorama.id so a picker switch swaps the form to fresh
  // values without an effect (which React 19's lint rejects in favour
  // of the key reset pattern). useState's initial value is read once
  // per mount, and a new key force-mounts the component.
  const [position, setPosition] = useState<Vec3>(panorama.position);
  const [yawOffset, setYawOffset] = useState(panorama.yawOffset);

  const dirty =
    position.x !== panorama.position.x ||
    position.y !== panorama.position.y ||
    position.z !== panorama.position.z ||
    yawOffset !== panorama.yawOffset;

  const useCameraPos = () => {
    const pos = cameraPositionRef.current;
    if (!pos) return;
    setPosition(pos);
  };

  return (
    <div className="pointer-events-auto w-full rounded-xl border border-white/20 bg-black/50 p-3 shadow-xl backdrop-blur">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="truncate text-xs font-semibold uppercase tracking-wider text-cyan-300/80">
          {panorama.title}
        </h3>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close panel"
          className="cursor-pointer text-neutral-400 transition-colors hover:text-white"
        >
          ×
        </button>
      </div>

      {failed ? (
        <p className="mb-3 rounded-lg border border-amber-300/40 bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-amber-200">
          This image failed to load — the uploaded file isn&apos;t a valid
          equirectangular JPG or PNG. Delete this panorama and upload a correct
          image.
        </p>
      ) : (
        <>
          <button
            type="button"
            onClick={onToggleView}
            aria-pressed={inPanoramaMode}
            data-tour="panorama-view-toggle"
            className={`mb-3 w-full cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 ${
              inPanoramaMode
                ? "border-cyan-300/60 bg-cyan-500/15 text-cyan-100 hover:bg-cyan-500/20"
                : "border-white/25 bg-white/10 text-white hover:bg-white/20"
            }`}
          >
            {inPanoramaMode ? "Switch to 3D view" : "Enter panorama view"}
          </button>

          {canWrite ? (
            <button
              type="button"
              onClick={onCalibrate}
              data-tour="panorama-calibrate"
              className="mb-3 w-full cursor-pointer rounded-lg border border-cyan-300/40 bg-cyan-500/10 px-3 py-1.5 text-xs font-medium text-cyan-100 transition-colors hover:bg-cyan-500/20"
            >
              Calibrate (overlay)
            </button>
          ) : null}

          {canWrite ? (
          <div className="space-y-3">
            <Vec3Field label="Position" value={position} onChange={setPosition} step={0.05} />

            <button
              type="button"
              onClick={useCameraPos}
              disabled={inPanoramaMode}
              data-tour="panorama-set-from-camera"
              title={
                inPanoramaMode
                  ? "Switch to 3D view first — camera is locked at the anchor inside the panorama"
                  : "Copy the current 3D camera position into the position fields"
              }
              className="w-full cursor-pointer rounded-md border border-white/10 bg-white/[0.04] px-2 py-1.5 text-xs text-neutral-200 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Set from camera
            </button>

            <div data-tour="panorama-yaw">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-[0.18em] text-neutral-400">
                  Yaw offset
                </span>
                <QuantityStepper
                  ariaLabel="Yaw offset in degrees"
                  min={0}
                  max={360}
                  value={Math.round(yawOffset * RAD_TO_DEG)}
                  onChange={(deg) => setYawOffset(deg / RAD_TO_DEG)}
                />
              </div>
              <input
                type="range"
                min={0}
                max={TAU}
                step={TAU / 360}
                value={yawOffset}
                onChange={(e) => setYawOffset(Number.parseFloat(e.target.value))}
                className="w-full cursor-pointer accent-cyan-300"
              />
            </div>

            <button
              type="button"
              onClick={() => onSave({ position, yawOffset })}
              disabled={!dirty}
              data-tour="panorama-save-anchor"
              className="w-full cursor-pointer rounded-md bg-cyan-300 px-2 py-1.5 text-xs font-semibold text-neutral-900 transition-colors hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Save anchor
            </button>
          </div>
          ) : null}
        </>
      )}

      {canDelete ? (
        // Wrapper, not the button: DeleteButton owns its own element and takes
        // no pass-through props. It vanishes with canDelete, so the step still
        // auto-skips.
        <div data-tour="panorama-delete">
        <DeleteButton
          label={panorama.title}
          onDelete={onDelete}
          className="mt-3 w-full cursor-pointer rounded-md border border-red-300/40 bg-red-500/10 px-2 py-1.5 text-xs font-semibold text-red-200 transition-colors hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Delete panorama
        </DeleteButton>
        </div>
      ) : null}
    </div>
  );
}
