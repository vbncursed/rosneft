import { useId } from "react";
import { toDegrees, toRadians, type PlacementTransform, type Vec3 } from "@/entities/placement";
import type { GizmoMode } from "@/features/viewer-mode";
import { Button } from "@/shared/ui/button";
import { Segmented } from "@/shared/ui/segmented";
import { Switch } from "@/shared/ui/switch";
import { TextField } from "@/shared/ui/text-field";
import { Vec3Field } from "@/shared/ui/vec3-field";

export type SelectedBlockProps = {
  name: string;
  gizmo: GizmoMode;
  onGizmo: (gizmo: GizmoMode) => void;
  /** Radians in, as the scene stores them; the block draws degrees. */
  transform: PlacementTransform;
  snap: boolean;
  onSnap: (on: boolean) => void;
  canWrite: boolean;
  /** The live draft. Absent — no write grant, nothing selected — the grid only reports. */
  form: null | {
    kind: "new" | "edit";
    label: string;
    onLabel: (label: string) => void;
    transform: PlacementTransform;
    onTransform: (transform: PlacementTransform) => void;
    saving: boolean;
    onSave: () => void;
    onCancel: () => void;
  };
  /** Under 1280 the panel is 300 wide and the keys lose their parentheses. */
  compact: boolean;
};

const MODES: { value: GizmoMode; word: string; key: string }[] = [
  { value: "translate", word: "Translate", key: "T" },
  { value: "rotate", word: "Rotate", key: "R" },
  { value: "scale", word: "Scale", key: "S" },
];

const dp3 = (n: number) => n.toFixed(3);
const degreesWithSign = (n: number) => `${toDegrees(n)}°`;
const toDegreeVec = (v: Vec3): Vec3 => ({ x: toDegrees(v.x), y: toDegrees(v.y), z: toDegrees(v.z) });
const toRadianVec = (v: Vec3): Vec3 => ({ x: toRadians(v.x), y: toRadians(v.y), z: toRadians(v.z) });

/**
 * What the overline says: which object, and what is happening to it. Editing
 * is the block's resting state and goes unremarked; being newly placed or
 * mid-PUT does not.
 */
const overlineFor = (form: SelectedBlockProps["form"]) => {
  if (!form) return "Selected";
  if (form.saving) return "Selected · saving";
  return form.kind === "new" ? "Selected · new" : "Selected";
};

/**
 * The block under the object list: which instance is selected, how the gizmo
 * moves it, where it stands, and what to call it.
 *
 * An open form means a writer has something selected, so the label, the cells
 * and Save are all live; without one the grid only reports. The exception is a
 * save in flight — a cell that accepts typing during a PUT invites an edit the
 * response is about to overwrite. `typing` also picks the unit: the boxes
 * carry bare degrees and report radians, a printed cell converts as it prints.
 *
 * The snap switch belongs to the gizmo, not to the form, so it stays put
 * whatever the draft is doing.
 */
export function SelectedBlock({
  name,
  gizmo,
  onGizmo,
  transform,
  snap,
  onSnap,
  canWrite,
  form,
  compact,
}: SelectedBlockProps) {
  const typing = form !== null && !form.saving;
  const snapId = useId();
  const shown = form ? form.transform : transform;

  return (
    <div className="flex flex-col gap-[11px]">
      <div className="flex items-center justify-between gap-2.5">
        <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.2em] text-muted">
          {overlineFor(form)}
        </span>
        <span className="min-w-0 truncate font-mono text-[10px] text-accent">{name}</span>
      </div>

      {canWrite ? (
        <Segmented
          ariaLabel="Gizmo mode"
          tone="soft"
          size="xs"
          value={gizmo}
          onChange={onGizmo}
          items={MODES.map(({ value, word, key }) => ({
            value,
            label: compact ? `${word} ${key}` : `${word} (${key})`,
          }))}
        />
      ) : null}

      {form ? (
        <TextField
          label="Label"
          value={form.label}
          onChange={(e) => form.onLabel(e.target.value)}
          disabled={form.saving}
          placeholder="Tank 4, north row"
        />
      ) : null}

      <div className="flex flex-col gap-[7px]">
        <Vec3Field
          layout="row"
          label="Pos"
          readOnly={!typing}
          format={dp3}
          value={shown.position}
          onChange={(position) => form?.onTransform({ ...shown, position })}
        />
        <Vec3Field
          layout="row"
          label="Rot"
          readOnly={!typing}
          tone="muted"
          format={typing ? String : degreesWithSign}
          value={typing ? toDegreeVec(shown.rotation) : shown.rotation}
          onChange={(rotation) => form?.onTransform({ ...shown, rotation: toRadianVec(rotation) })}
        />
        <Vec3Field
          layout="row"
          label="Scl"
          readOnly={!typing}
          tone="muted"
          format={dp3}
          value={shown.scale}
          onChange={(scale) => form?.onTransform({ ...shown, scale })}
        />
      </div>

      {canWrite ? (
        <div className="flex items-center justify-between gap-2.5 rounded-[8px] border border-line bg-panel-2 px-[11px] py-2">
          <span className="font-mono text-[10px] text-fg">
            {/* The id sits on the words alone — the key hint is not part of the
                control's name. */}
            <span id={snapId}>Snap to surface</span>{" "}
            <kbd className="rounded-[3px] border border-line-2 px-1 font-mono text-[9px] text-muted">
              G
            </kbd>
          </span>
          {/* Named by the visible text rather than repeating it: the label and
              the aria-label could otherwise drift apart. */}
          <Switch checked={snap} onChange={onSnap} label="Snap to surface" labelledBy={snapId} />
        </div>
      ) : null}

      {form ? (
        <div className="flex gap-[9px]">
          <Button variant="primary" size="sm" loading={form.saving} onClick={form.onSave}>
            {form.saving ? "Saving…" : "Save"}
          </Button>
          <Button size="sm" onClick={form.onCancel}>
            Cancel
          </Button>
        </div>
      ) : null}
    </div>
  );
}
