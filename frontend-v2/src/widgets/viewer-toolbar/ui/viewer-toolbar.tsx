import type { ReactNode } from "react";
import { Button } from "@/shared/ui/button";

export type ViewerToolbarProps = {
  onResetCamera: () => void;
  /** The measure toggle and any other tool controls. */
  tools?: ReactNode;
  onShowHelp: () => void;
  /** Absent, or 0, hides the clear control — there is nothing to clear. */
  measurementCount?: number;
  onClearMeasurements?: () => void;
};

export function ViewerToolbar({
  onResetCamera,
  tools,
  onShowHelp,
  measurementCount = 0,
  onClearMeasurements,
}: ViewerToolbarProps) {
  return (
    <div role="toolbar" aria-label="Viewer" className="flex flex-wrap items-center gap-[7px]">
      <Button onClick={onResetCamera}>Reset camera</Button>
      {tools}
      <Button shape="icon" size="sm" aria-label="Keyboard shortcuts" onClick={onShowHelp}>
        ?
      </Button>
      {measurementCount > 0 && onClearMeasurements ? (
        <Button onClick={onClearMeasurements}>Clear ({measurementCount})</Button>
      ) : null}
    </div>
  );
}
