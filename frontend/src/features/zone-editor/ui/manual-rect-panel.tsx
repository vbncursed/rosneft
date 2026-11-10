import { Button } from "@/shared/ui/button";
import { controlClass } from "@/shared/ui/text-field";
import type { ManualRect } from "../model/manual-rect";

export function ManualRectPanel({
  drawing,
  disabled,
  manual,
  onDraw,
  onEdit,
  onCreate,
  metresPerPt,
}: {
  drawing: boolean;
  disabled: boolean;
  manual: ManualRect | null;
  metresPerPt?: number | null;
  onCreate?: () => void;
  onDraw: (value: boolean) => void;
  onEdit: (value: ManualRect) => void;
}) {
  const fields: [keyof ManualRect, string][] = [
    ["x", "Centre X (pt)"],
    ["y", "Centre Y (pt)"],
    ["width", metresPerPt ? "Drawing width (m)" : "Width (pt)"],
    ["height", metresPerPt ? "Drawing height (m)" : "Height (pt)"],
    ["angle", "Rotation (degrees)"],
  ];
  return (
    <section aria-label="Manual rectangle" className="flex flex-col gap-2">
      <Button size="sm" variant="secondary" disabled={disabled} onClick={() => onDraw(!drawing)}>
        {drawing ? "Cancel drawing" : "Draw rectangle"}
      </Button>
      <Button size="sm" variant="secondary" disabled={disabled} onClick={onCreate}>
        Create rectangle with fields
      </Button>
      {manual ? (
        <p className="m-0 text-[12px] text-muted">
          {metresPerPt
            ? "These are drawing dimensions; the model dimensions may differ."
            : "Scale unknown: dimensions are in PDF points."}
        </p>
      ) : null}
      {drawing ? <p className="m-0 text-[12px] text-muted">Drag on the plan to draw a rectangle.</p> : null}
      {manual ? (
        <div className="grid grid-cols-2 gap-2">
          {fields.map(([key, label]) => (
            <label key={key} className="text-[12px] text-muted">
              {label}
              <input
                type="number"
                step="any"
                value={
                  (key === "width" || key === "height") && metresPerPt
                    ? Number((manual[key] * metresPerPt).toPrecision(12))
                    : manual[key]
                }
                className={controlClass({ invalid: false })}
                onChange={(e) => {
                  const value = e.currentTarget.valueAsNumber;
                  if (Number.isFinite(value) && (!(key === "width" || key === "height") || value > 0))
                    onEdit({
                      ...manual,
                      [key]: (key === "width" || key === "height") && metresPerPt ? value / metresPerPt : value,
                    });
                }}
              />
            </label>
          ))}
        </div>
      ) : null}
    </section>
  );
}
