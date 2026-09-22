import { useState } from "react";
import { Icon, type IconName } from "@/shared/ui/icon";
import { Tooltip, type TooltipProps } from "./tooltip";

const TILE =
  "flex size-[30px] items-center justify-center rounded-[7px] border border-line bg-panel-2 text-muted enabled:hover:text-fg disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

function Tile({ icon, label, disabled, ...tip }: Omit<TooltipProps, "children"> & { icon: IconName; disabled?: boolean }) {
  return (
    <Tooltip label={label} {...tip}>
      <button type="button" aria-label={label} className={TILE} disabled={disabled}>
        <Icon name={icon} size={15} />
      </button>
    </Tooltip>
  );
}

// Enter or Space keeps focus, so the tooltip stays and must re-measure: the
// longer label, at the right edge, is clamped again rather than overrunning.
function EdgeToggle() {
  const [locked, setLocked] = useState(false);
  const label = locked ? "Camera locked — press to free it" : "Lock";
  return (
    <div className="flex justify-end p-6 pt-12">
      <Tooltip label={label}>
        <button type="button" aria-label={label} aria-pressed={locked} className={TILE} onClick={() => setLocked((l) => !l)}>
          <Icon name="lock" size={15} />
        </button>
      </Tooltip>
    </div>
  );
}

export default {
  // Hover for half a second, then sweep along the row: the rest open at once.
  row: (
    <div className="flex gap-1 rounded-card border border-line bg-panel p-6 pt-12">
      <Tile icon="refresh" label="Reset camera" />
      <Tile icon="ruler" label="Measure" shortcut="M" />
      <Tile icon="plus" label="Add objects" />
      <Tile icon="eye" label="Show measurements" />
      <Tile icon="trash" label="Delete" disabled />
    </div>
  ),
  // The rail sits under the header, so its tooltips hang below it.
  bottom: (
    <div className="flex gap-1 rounded-card border border-line bg-panel p-6">
      <Tile icon="refresh" label="Reset camera" side="bottom" />
      <Tile icon="ruler" label="Measure" shortcut="M" side="bottom" />
    </div>
  ),
  // A disabled button takes no hover; the wrapper does, and says why.
  disabled: (
    <div className="flex gap-1 rounded-card border border-line bg-panel p-6 pt-12">
      <Tooltip label="Remove its placements first">
        <button type="button" aria-label="Delete, used on 2 territories" className={TILE} disabled>
          <Icon name="trash" size={15} />
        </button>
      </Tooltip>
    </div>
  ),
  toggle: EdgeToggle,
  // Scrolling the panel closes an open tooltip; the last control is below the
  // fold, and tabbing to it scrolls it in without closing its own tooltip.
  scroll: (
    <div className="p-6">
      <div className="h-40 w-64 overflow-auto rounded-card border border-line bg-panel p-4 pt-10">
        <div className="flex flex-col items-start gap-24">
          <Tile icon="pencil" label="Rename" />
          <Tile icon="eye" label="Show" />
          <Tile icon="trash" label="Delete" />
        </div>
      </div>
    </div>
  ),
  // Each corner forces a flip (top row) or a clamp (every one of them).
  edges: (
    <div className="relative h-dvh w-full">
      <div className="absolute left-0 top-0"><Tile icon="pencil" label="Top left flips below" /></div>
      <div className="absolute right-0 top-0"><Tile icon="cube" label="Top right flips below" /></div>
      <div className="absolute bottom-0 left-0"><Tile icon="download" label="Bottom left" side="bottom" /></div>
      <div className="absolute bottom-0 right-0"><Tile icon="upload" label="Bottom right" side="bottom" shortcut="U" /></div>
    </div>
  ),
};
