import { useState } from "react";
import type { Panorama } from "@/panorama/domain/panorama";
import type { CalibrationDraft } from "@/panorama/domain/calibration";
import QuantityStepper from "@/placement/presentation/components/quantity-stepper";

interface PanoramaCalibrationPanelProps {
  panorama: Panorama;
  draft: CalibrationDraft;
  opacity: number;
  onNudge: (axis: "x" | "y" | "z", delta: number) => void;
  onSetYaw: (rad: number) => void;
  onSetOpacity: (o: number) => void;
  onSave: () => void;
  onExit: () => void;
}

const TAU = Math.PI * 2;
const RAD_TO_DEG = 180 / Math.PI;
const STEPS = [
  { label: "Fine", value: 0.005 },
  { label: "Med", value: 0.02 },
  { label: "Coarse", value: 0.1 },
];
const AXES: ("x" | "y" | "z")[] = ["x", "y", "z"];

// PanoramaCalibrationPanel fine-tunes a panorama against the ghosted photo
// overlay: photo opacity, per-axis anchor nudging at a chosen step, and yaw
// (slider + degrees). Coarse placement stays in the normal edit panel.
export default function PanoramaCalibrationPanel({
  panorama,
  draft,
  opacity,
  onNudge,
  onSetYaw,
  onSetOpacity,
  onSave,
  onExit,
}: PanoramaCalibrationPanelProps) {
  const [step, setStep] = useState(STEPS[0].value);
  const deg = Math.round(draft.yawOffset * RAD_TO_DEG);

  return (
    <div className="pointer-events-auto w-full rounded-xl border border-cyan-300/30 bg-black/60 p-3 shadow-xl backdrop-blur">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="truncate text-xs font-semibold uppercase tracking-wider text-cyan-300/90">
          Calibrate · {panorama.title}
        </h3>
        <button
          type="button"
          onClick={onExit}
          aria-label="Exit calibration"
          className="cursor-pointer text-neutral-400 transition-colors hover:text-white"
        >
          ×
        </button>
      </div>

      <label className="mb-3 block">
        <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-[0.18em] text-neutral-400">
          <span>Photo opacity</span>
          <span className="text-neutral-500">{Math.round(opacity * 100)}%</span>
        </div>
        <input
          type="range"
          min={0.15}
          max={1}
          step={0.05}
          value={opacity}
          onChange={(e) => onSetOpacity(Number.parseFloat(e.target.value))}
          className="w-full cursor-pointer accent-cyan-300"
        />
      </label>

      <div className="mb-3">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-[0.18em] text-neutral-400">
            Anchor nudge
          </span>
          <div className="flex gap-1">
            {STEPS.map((s) => (
              <button
                key={s.label}
                type="button"
                onClick={() => setStep(s.value)}
                className={`cursor-pointer rounded px-1.5 py-0.5 text-[10px] transition-colors ${
                  step === s.value
                    ? "bg-cyan-500/25 text-cyan-100"
                    : "bg-white/5 text-neutral-300 hover:bg-white/10"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-1">
          {AXES.map((axis) => (
            <div key={axis} className="flex items-center gap-2">
              <span className="w-4 text-[11px] uppercase text-neutral-400">
                {axis}
              </span>
              <button
                type="button"
                onClick={() => onNudge(axis, -step)}
                className="h-6 flex-1 cursor-pointer rounded border border-white/10 bg-white/[0.04] text-xs text-neutral-200 transition-colors hover:bg-white/10"
              >
                −
              </button>
              <span className="w-16 text-center text-[11px] tabular-nums text-neutral-300">
                {draft.position[axis].toFixed(3)}
              </span>
              <button
                type="button"
                onClick={() => onNudge(axis, step)}
                className="h-6 flex-1 cursor-pointer rounded border border-white/10 bg-white/[0.04] text-xs text-neutral-200 transition-colors hover:bg-white/10"
              >
                +
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="mb-3">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-[0.18em] text-neutral-400">
            Yaw
          </span>
          <QuantityStepper
            ariaLabel="Yaw offset in degrees"
            min={0}
            max={360}
            value={deg}
            onChange={(d) => onSetYaw(d / RAD_TO_DEG)}
          />
        </div>
        <input
          type="range"
          min={0}
          max={TAU}
          step={TAU / 360}
          value={draft.yawOffset}
          onChange={(e) => onSetYaw(Number.parseFloat(e.target.value))}
          className="w-full cursor-pointer accent-cyan-300"
        />
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onSave}
          className="flex-1 cursor-pointer rounded-md bg-cyan-300 px-2 py-1.5 text-xs font-semibold text-neutral-900 transition-colors hover:bg-cyan-200"
        >
          Save
        </button>
        <button
          type="button"
          onClick={onExit}
          className="cursor-pointer rounded-md border border-white/20 bg-transparent px-3 py-1.5 text-xs text-neutral-200 transition-colors hover:bg-white/[0.06]"
        >
          Exit
        </button>
      </div>
    </div>
  );
}
