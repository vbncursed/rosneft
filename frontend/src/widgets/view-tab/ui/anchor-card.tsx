import { useState, type RefObject } from "react";
import type { Panorama, PanoramaUpdate } from "@/entities/panorama";
import type { Vec3 } from "@/entities/placement";
import { Button } from "@/shared/ui/button";
import { Callout } from "@/shared/ui/callout";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { Icon } from "@/shared/ui/icon";
import { Tooltip } from "@/shared/ui/tooltip";
import {
  anchorCounter,
  CALIBRATE,
  CLOSE_EDITOR,
  DELETE_PANORAMA,
  deletePanoramaTitle,
  EDITING_OVERLINE,
  ENTER_PANORAMA_VIEW,
  IMAGE_FAILED,
  SAVE_ANCHOR,
  SWITCH_TO_3D,
} from "../model/copy";
import { AnchorFields } from "./anchor-fields";
import { CalibrationCard, type CalibrationCardProps } from "./calibration-card";

export type AnchorCardProps = {
  panorama: Panorama;
  /** Which of the territory's panoramas this is. `current: 0` — the target is gone. */
  index: { current: number; total: number };
  /** The camera is inside this panorama. */
  inside: boolean;
  /** The equirect image failed to load: nothing here can be calibrated. */
  failed: boolean;
  cameraPositionRef: RefObject<Vec3 | null>;
  cameraYawRef: RefObject<number | null>;
  saving: boolean;
  canDelete: boolean;
  onSave: (patch: PanoramaUpdate) => void;
  /** The card confirms first. */
  onDelete: () => void;
  onToggleView: () => void;
  onCalibrate: () => void;
  onClose: () => void;
  /** Open calibration owns the numbers; the anchor fields stand down while it is. */
  calibration: CalibrationCardProps | null;
};

/**
 * The anchor editor. The draft lives in `Draft` below and is reseeded by a key,
 * not an effect: a drag in the viewport writes the panorama through the gateway,
 * and the new values have to reach the boxes without racing the render that
 * brought them.
 *
 * `updatedAt` carries the key because a calibration save can change only the
 * yaw — the three position legs would be identical and the boxes would keep
 * showing the angle the server has just replaced. The legs stay because a
 * move-drag and a save can land on the same timestamp.
 */
export function AnchorCard(props: AnchorCardProps) {
  const { id, updatedAt, position } = props.panorama;
  return <Draft key={`${id}:${updatedAt}:${position.x},${position.y},${position.z}`} {...props} />;
}

function Draft({
  panorama,
  index,
  inside,
  failed,
  cameraPositionRef,
  cameraYawRef,
  saving,
  canDelete,
  onSave,
  onDelete,
  onToggleView,
  onCalibrate,
  onClose,
  calibration,
}: AnchorCardProps) {
  const [title, setTitle] = useState(panorama.title);
  const [position, setPosition] = useState(panorama.position);
  const [yawOffset, setYawOffset] = useState(panorama.yawOffset);
  const [defaultYaw, setDefaultYaw] = useState(panorama.defaultYaw);
  const [confirming, setConfirming] = useState(false);

  // Nothing to save while the photo is missing or calibration holds the numbers.
  const editable = !failed && calibration === null;

  const dirty =
    title !== panorama.title ||
    position.x !== panorama.position.x ||
    position.y !== panorama.position.y ||
    position.z !== panorama.position.z ||
    yawOffset !== panorama.yawOffset ||
    defaultYaw !== panorama.defaultYaw;

  return (
    <div className="flex flex-col gap-[11px] rounded-control-lg border border-accent bg-panel-2 p-3">
      <div className="flex items-center justify-between gap-2.5">
        <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.2em] text-muted">
          {EDITING_OVERLINE}
        </span>
        <span className="flex items-center gap-2">
          {/* A deleted target leaves no ordinal — "0 of 2" names nothing. */}
          {index.current > 0 ? (
            <span className="font-mono text-[10px] text-accent">
              {anchorCounter(index.current, index.total)}
            </span>
          ) : null}
          <Tooltip label={CLOSE_EDITOR}>
            <button
              type="button"
              onClick={onClose}
              aria-label={CLOSE_EDITOR}
              className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-control-sm border border-line-2 bg-panel text-muted transition-[color,scale] duration-150 ease-out hover:text-fg active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
            >
              <Icon name="close" size={12} />
            </button>
          </Tooltip>
        </span>
      </div>

      {failed ? (
        <Callout tone="warn" size="note">
          {IMAGE_FAILED}
        </Callout>
      ) : null}

      {/* A failed photo strips the card to that sentence — unless an alignment
          is open. That block owns the only `Save` and the only `Exit` there
          are, and the ring on the model stays drawn and draggable either way:
          taking it away strands the alignment with no way to end it. */}
      {failed && !calibration ? null : (
        <>
          {failed ? null : (
            <Button
              size="sm"
              onClick={onToggleView}
              aria-pressed={inside}
              data-tour="panorama-view-toggle"
            >
              {inside ? SWITCH_TO_3D : ENTER_PANORAMA_VIEW}
            </Button>
          )}

          {/* Already calibrating — the way out is the block's own Exit. */}
          {calibration ? null : (
            <Button variant="accent" size="sm" onClick={onCalibrate} data-tour="panorama-calibrate">
              {CALIBRATE}
            </Button>
          )}

          {calibration ? (
            <CalibrationCard {...calibration} />
          ) : (
            <>
              <AnchorFields
                title={title}
                onTitle={setTitle}
                position={position}
                onPosition={setPosition}
                yawOffset={yawOffset}
                onYawOffset={setYawOffset}
                defaultYaw={defaultYaw}
                inside={inside}
                onSetFromCamera={() => {
                  const live = cameraPositionRef.current;
                  if (live) setPosition(live);
                }}
                onSetDefaultView={() => {
                  const live = cameraYawRef.current;
                  if (live != null) setDefaultYaw(live);
                }}
                disabled={saving}
              />
            </>
          )}
        </>
      )}

      {/* The mock's last row: the emphasised action at one end, the
          irreversible one at the other, so neither is reached by accident. */}
      <div className="flex items-center justify-between gap-2.5">
        {editable ? (
          <Button
            variant="primary"
            size="sm"
            disabled={!dirty}
            loading={saving}
            data-tour="panorama-save-anchor"
            onClick={() => onSave({ title, position, yawOffset, defaultYaw })}
          >
            {SAVE_ANCHOR}
          </Button>
        ) : null}
        {canDelete ? (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            data-tour="panorama-delete"
            className="ml-auto cursor-pointer border-none bg-transparent p-0 text-xs text-bad transition-[color,scale] duration-150 ease-out active:scale-[0.97] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {DELETE_PANORAMA}
          </button>
        ) : null}
      </div>

      <ConfirmDialog
        open={confirming}
        tone="danger"
        title={deletePanoramaTitle(panorama.title)}
        description="The photo, its anchor and its calibration go with it. Uploading it again starts from an uncalibrated anchor."
        confirmLabel={DELETE_PANORAMA}
        onConfirm={() => {
          setConfirming(false);
          onDelete();
        }}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}
