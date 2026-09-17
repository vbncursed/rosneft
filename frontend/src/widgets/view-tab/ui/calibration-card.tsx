import type { Vec3 } from "@/entities/placement";
import { NUDGE_STEPS, type NudgeStep } from "@/features/panorama-view";
import { Button } from "@/shared/ui/button";
import { Range } from "@/shared/ui/range";
import { Segmented } from "@/shared/ui/segmented";
import { AXES } from "@/shared/ui/vec3-field";
import {
  EXIT,
  NUDGE_LABEL,
  nudgeLabel,
  OPACITY_LABEL,
  opacityPercent,
  SAVE,
  YAW_SHORT,
} from "../model/copy";
import { degToRad, printDegrees, radToDeg } from "../model/degrees";

export type CalibrationCardProps = {
  /** The ghosted photo over the mesh: 0.15–1, so it never disappears entirely. */
  opacity: number;
  onOpacity: (opacity: number) => void;
  /** How far one arrow press moves the anchor — one of NUDGE_STEPS' values. */
  step: number;
  onStep: (step: number) => void;
  position: Vec3;
  onNudge: (axis: "x" | "y" | "z", delta: number) => void;
  /** Radians; the row draws degrees. */
  yawOffset: number;
  onYaw: (radians: number) => void;
  onSave: () => void;
  onExit: () => void;
};

const OVERLINE = "font-mono text-[9px] uppercase tracking-[0.14em] text-muted";
const LABEL_ROW = "flex items-center justify-between gap-2.5";
const ARROW =
  "h-6 flex-1 cursor-pointer rounded-control-sm border border-line-2 bg-panel text-xs text-fg transition-[color,border-color,scale] duration-150 ease-out hover:border-accent-line active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent";

const dp3 = (n: number) => n.toFixed(3);
const stepLabel = (step: number): NudgeStep["label"] =>
  (NUDGE_STEPS.find((s) => s.value === step) ?? NUDGE_STEPS[0]).label;

/**
 * Fine alignment against the ghosted photo: how far through it the mesh shows,
 * how far one arrow press moves the anchor, and the yaw that turns the sphere.
 * It owns no draft — every press reports straight out, because the viewport is
 * showing the result live.
 */
export function CalibrationCard({
  opacity,
  onOpacity,
  step,
  onStep,
  position,
  onNudge,
  yawOffset,
  onYaw,
  onSave,
  onExit,
}: CalibrationCardProps) {
  const degrees = radToDeg(yawOffset);

  return (
    <div className="flex flex-col gap-[11px]">
      <div className="flex flex-col gap-[7px]">
        <div className={LABEL_ROW}>
          <span className={OVERLINE}>{OPACITY_LABEL}</span>
          <span className="font-mono text-[10px] text-fg">{opacityPercent(opacity)}</span>
        </div>
        <Range
          label={OPACITY_LABEL}
          value={opacity}
          min={0.15}
          max={1}
          step={0.05}
          onChange={onOpacity}
        />
      </div>

      <div className="flex flex-col gap-[7px]">
        <span className={OVERLINE}>{NUDGE_LABEL}</span>
        <Segmented
          ariaLabel={NUDGE_LABEL}
          tone="soft"
          size="xs"
          value={stepLabel(step)}
          onChange={(label) => onStep(NUDGE_STEPS.find((s) => s.label === label)!.value)}
          items={NUDGE_STEPS.map((s) => ({ value: s.label, label: s.label }))}
        />
        {AXES.map((axis) => (
          <div key={axis} className="flex items-center gap-2">
            <span aria-hidden="true" className="w-3.5 font-mono text-[11px] uppercase text-muted">
              {axis}
            </span>
            <button
              type="button"
              aria-label={nudgeLabel(axis, false)}
              onClick={() => onNudge(axis, -step)}
              className={ARROW}
            >
              −
            </button>
            <span className="w-16 text-center font-mono text-[11px] text-fg">{dp3(position[axis])}</span>
            <button
              type="button"
              aria-label={nudgeLabel(axis, true)}
              onClick={() => onNudge(axis, step)}
              className={ARROW}
            >
              +
            </button>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-[7px]">
        <div className={LABEL_ROW}>
          <span className={OVERLINE}>{YAW_SHORT}</span>
          <span className="font-mono text-[10px] text-fg">{printDegrees(yawOffset)}</span>
        </div>
        <Range
          label={YAW_SHORT}
          value={degrees}
          min={0}
          max={360}
          step={0.5}
          onChange={(deg) => onYaw(degToRad(deg))}
        />
      </div>

      <div className="flex gap-[9px]">
        <Button variant="primary" size="sm" onClick={onSave}>
          {SAVE}
        </Button>
        <Button size="sm" onClick={onExit}>
          {EXIT}
        </Button>
      </div>
    </div>
  );
}
