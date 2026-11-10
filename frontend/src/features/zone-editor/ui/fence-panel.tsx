import { useState } from "react";
import { Button } from "@/shared/ui/button";
import { controlClass } from "@/shared/ui/text-field";
import type { useFence } from "../model/use-fence";

export function FencePanel({
  fence,
  start,
  warning,
  disabled,
}: {
  fence: ReturnType<typeof useFence>;
  start: () => void;
  warning: boolean | null;
  disabled: boolean;
}) {
  const [x, setX] = useState("");
  const [y, setY] = useState("");
  return (
    <section aria-label="Site boundary" className="flex flex-col gap-2">
      <p className="m-0 text-[12px] text-muted">
        Trace the boundary along the green layer. It lasts only while this plan is open.
      </p>
      {!fence.drawing && (
        <Button size="sm" variant="secondary" disabled={disabled} onClick={start}>
          Trace boundary
        </Button>
      )}
      {fence.drawing && (
        <>
          <p className="m-0 text-[12px] text-muted">Click the plan to add points; drag to pan.</p>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[12px] text-muted">
              X (pt)
              <input
                aria-label="X (pt)"
                type="number"
                step="any"
                value={x}
                onChange={(e) => setX(e.target.value)}
                className={controlClass({ invalid: false })}
              />
            </label>
            <label className="text-[12px] text-muted">
              Y (pt)
              <input
                aria-label="Y (pt)"
                type="number"
                step="any"
                value={y}
                onChange={(e) => setY(e.target.value)}
                className={controlClass({ invalid: false })}
              />
            </label>
          </div>
          <Button
            size="sm"
            variant="secondary"
            disabled={!x.trim() || !y.trim() || !Number.isFinite(Number(x)) || !Number.isFinite(Number(y))}
            onClick={() => {
              fence.add({ x: Number(x), y: Number(y) });
              setX("");
              setY("");
            }}
          >
            Add point
          </Button>
          <div className="flex flex-wrap gap-1">
            <Button size="sm" variant="secondary" disabled={!fence.points.length} onClick={fence.undo}>
              Undo point
            </Button>
            <Button size="sm" variant="secondary" onClick={fence.close}>
              Close boundary
            </Button>
            <Button size="sm" variant="secondary" onClick={fence.clear}>
              Cancel
            </Button>
          </div>
          {fence.error && (
            <p role="alert" className="m-0 text-[12px]">
              Use at least three distinct points without crossing the boundary.
            </p>
          )}
        </>
      )}
      {fence.closed && (
        <Button size="sm" variant="secondary" onClick={fence.clear}>
          Clear boundary
        </Button>
      )}
      <p role="status" className="m-0 text-[12px] text-muted">
        {fence.closed
          ? warning
            ? "Part of this zone is outside the boundary."
            : "Boundary set."
          : "No boundary set; zone boundaries have not been checked."}
      </p>
    </section>
  );
}
