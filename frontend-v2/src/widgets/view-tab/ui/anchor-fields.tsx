import { useId, useState } from "react";
import type { Vec3 } from "@/entities/placement";
import { Range } from "@/shared/ui/range";
import { Vec3Field } from "@/shared/ui/vec3-field";
import {
  defaultLook,
  POSITION_LABEL,
  SET_DEFAULT_VIEW,
  SET_FROM_CAMERA,
  TITLE_LABEL,
  YAW_LABEL,
} from "../model/copy";
import { degToRad, radToDeg } from "../model/degrees";

export type AnchorFieldsProps = {
  title: string;
  onTitle: (title: string) => void;
  position: Vec3;
  onPosition: (position: Vec3) => void;
  /** Radians, as the panorama stores them; the row draws degrees. */
  yawOffset: number;
  onYawOffset: (radians: number) => void;
  /** Radians. Zero means nobody has captured one, and the row says nothing. */
  defaultYaw: number;
  /** The camera is locked at this anchor: its position is no use, its look direction is. */
  inside: boolean;
  onSetFromCamera: () => void;
  onSetDefaultView: () => void;
  /** A save is in flight — the numbers the response is about to replace stop accepting edits. */
  disabled: boolean;
};

// The panel-scale input, one step down from the DS form control: the card is
// 320 wide and holds four rows. Vec3Field's row cells are hand-written for the
// same reason.
const BOX =
  "rounded-[7px] border border-line-2 bg-panel px-2.5 py-2 text-xs text-fg outline-none focus:border-accent disabled:text-dim disabled:opacity-60 disabled:transition-[color,opacity] disabled:duration-150";
const DP3 = (n: number) => n.toFixed(3);
const OVERLINE = "font-mono text-[9px] uppercase tracking-[0.14em] text-muted";
const TEXT_BUTTON =
  "cursor-pointer border-none bg-transparent p-0 font-mono text-[10px] uppercase tracking-[0.08em] text-accent transition-[color,scale] duration-150 ease-out hover:underline enabled:active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent disabled:cursor-not-allowed disabled:text-dim disabled:no-underline";
const LABEL_ROW = "flex items-center justify-between gap-2.5";

/**
 * The four rows of the anchor card: what the panorama is called, where it was
 * shot, which way its sphere is turned, and where a reader first looks. Every
 * value is a draft the card holds — this block only draws and reports.
 */
export function AnchorFields({
  title,
  onTitle,
  position,
  onPosition,
  yawOffset,
  onYawOffset,
  defaultYaw,
  inside,
  onSetFromCamera,
  onSetDefaultView,
  disabled,
}: AnchorFieldsProps) {
  const titleId = useId();
  const degrees = radToDeg(yawOffset);
  // What is literally in the degrees box while it is being typed. Without it
  // every keystroke reformats to one decimal and the caret lands mid-number,
  // so "90" arrives as 9. Cleared on blur, when the value takes over again.
  const [draft, setDraft] = useState<string | null>(null);

  return (
    <>
      <div className="flex flex-col gap-[7px]">
        <label htmlFor={titleId} className={OVERLINE}>
          {TITLE_LABEL}
        </label>
        <input
          id={titleId}
          value={title}
          disabled={disabled}
          onChange={(e) => onTitle(e.target.value)}
          className={BOX}
        />
      </div>

      <div className="flex flex-col gap-[7px]">
        <div className={LABEL_ROW}>
          <span className={OVERLINE}>{POSITION_LABEL}</span>
          <button
            type="button"
            onClick={onSetFromCamera}
            // Inside the panorama the camera sits *at* the anchor, so reading
            // it back would only ever write the value already there.
            disabled={disabled || inside}
            data-tour="panorama-set-from-camera"
            className={TEXT_BUTTON}
          >
            {SET_FROM_CAMERA}
          </button>
        </div>
        <Vec3Field
          layout="row"
          label="Pos"
          value={position}
          onChange={onPosition}
          disabled={disabled}
          format={DP3}
        />
      </div>

      <div data-tour="panorama-yaw" className="flex flex-col gap-[7px]">
        <div className={LABEL_ROW}>
          <span className={OVERLINE}>{YAW_LABEL}</span>
          <button
            type="button"
            onClick={onSetDefaultView}
            // The look direction only exists once the camera is in the sphere.
            disabled={disabled || !inside}
            data-tour="panorama-default-view"
            className={TEXT_BUTTON}
          >
            {SET_DEFAULT_VIEW}
          </button>
        </div>

        <div className={LABEL_ROW}>
          {defaultYaw === 0 ? (
            <span />
          ) : (
            <span className="font-mono text-[10px] text-muted">{defaultLook(defaultYaw)}</span>
          )}
          <input
            type="number"
            step="0.5"
            // The words above name the row; this box names its unit, because
            // what it holds is a number of degrees and the slider below is not.
            aria-label={`${YAW_LABEL} in degrees`}
            value={draft ?? degrees.toFixed(1)}
            disabled={disabled}
            onChange={(e) => {
              setDraft(e.target.value);
              const typed = Number(e.target.value);
              if (e.target.value !== "" && Number.isFinite(typed)) onYawOffset(degToRad(typed));
            }}
            onBlur={() => setDraft(null)}
            className={`${BOX} w-24 shrink-0 text-right font-mono`}
          />
        </div>

        <Range
          label={YAW_LABEL}
          value={degrees}
          min={0}
          max={360}
          // Whole degrees: 720 half-degree stops on a 260px track are out of a
          // mouse's reach. The box above still takes halves.
          step={1}
          disabled={disabled}
          onChange={(deg) => onYawOffset(degToRad(deg))}
        />
      </div>
    </>
  );
}
