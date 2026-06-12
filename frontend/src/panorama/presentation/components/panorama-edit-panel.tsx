import { type RefObject, useState } from "react";
import type { Panorama } from "@/panorama/domain/panorama";
import type { Vec3 } from "@/shared/domain/vec3";
import Vec3Field from "@/placement/presentation/components/vec3-field";

interface PanoramaEditPanelProps {
  panorama: Panorama;
  // Live camera position from the Canvas. Read on demand when the user
  // clicks "Set from camera".
  cameraPositionRef: RefObject<Vec3 | null>;
  // True when the camera is currently locked inside this panorama —
  // "Set from camera" can't help there, so it's disabled.
  inPanoramaMode: boolean;
  onSave: (patch: { position?: Vec3; yawOffset?: number }) => void;
  onToggleView: () => void;
  onClose: () => void;
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
  onSave,
  onToggleView,
  onClose,
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

      <button
        type="button"
        onClick={onToggleView}
        aria-pressed={inPanoramaMode}
        className={`mb-3 w-full cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 ${
          inPanoramaMode
            ? "border-cyan-300/60 bg-cyan-500/15 text-cyan-100 hover:bg-cyan-500/20"
            : "border-white/25 bg-white/10 text-white hover:bg-white/20"
        }`}
      >
        {inPanoramaMode ? "Switch to 3D view" : "Enter panorama view"}
      </button>

      <div className="space-y-3">
        <Vec3Field label="Position" value={position} onChange={setPosition} step={0.05} />

        <button
          type="button"
          onClick={useCameraPos}
          disabled={inPanoramaMode}
          title={
            inPanoramaMode
              ? "Switch to 3D view first — camera is locked at the anchor inside the panorama"
              : "Copy the current 3D camera position into the position fields"
          }
          className="w-full cursor-pointer rounded-md border border-white/10 bg-white/[0.04] px-2 py-1.5 text-xs text-neutral-200 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Set from camera
        </button>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-[0.18em] text-neutral-400">
              Yaw offset
            </span>
            <span className="text-[10px] text-neutral-500">
              {(yawOffset * RAD_TO_DEG).toFixed(1)}°
            </span>
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
          className="w-full cursor-pointer rounded-md bg-cyan-300 px-2 py-1.5 text-xs font-semibold text-neutral-900 transition-colors hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Save anchor
        </button>
      </div>
    </div>
  );
}
