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
