import { ViewportWindow, type ViewportWindowAction } from "./viewport-window";

const NAME = "plan-sheet-03.pdf";
const GEO = { x: 300, y: 100, w: 560, h: 400 };

const pipActions: ViewportWindowAction[] = [
  { name: `Expand ${NAME}`, icon: "maximize", onClick: () => {} },
  { name: `Hide ${NAME}`, icon: "minus", onClick: () => {} },
  { name: `Delete ${NAME}`, icon: "trash", tone: "bad", onClick: () => {} },
  { name: "Exit document overlay", icon: "close", onClick: () => {} },
];

const expandedActions: ViewportWindowAction[] = [
  { name: `Restore ${NAME} to a window`, icon: "minimize", onClick: () => {} },
  { name: "Exit document overlay", icon: "close", onClick: () => {} },
];

function Body() {
  return (
    <div className="flex flex-col gap-2 p-3.5">
      <span className="font-mono text-[10px] text-muted">page 3 / 12 · fit width · 96 %</span>
      <div className="flex flex-1 items-center justify-center rounded-control-sm border border-dashed border-line text-[11px] text-dim">
        pdf.js stand-in
      </div>
    </div>
  );
}

export default {
  // Mock state 12 — the document PiP window, floating.
  pip: (
    <div className="relative h-[600px] w-[900px] bg-bg">
      <ViewportWindow title={NAME} geometry={GEO} actions={pipActions}>
        <Body />
      </ViewportWindow>
    </div>
  ),
  // Mock state 12, expanded — geometry null fills the viewport at the 14 inset.
  expanded: (
    <div className="relative h-[600px] w-[900px] bg-bg">
      <ViewportWindow title={NAME} geometry={null} actions={expandedActions}>
        <Body />
      </ViewportWindow>
    </div>
  ),
  // Mid-drag: the transparent shield over the body.
  dragging: (
    <div className="relative h-[600px] w-[900px] bg-bg">
      <ViewportWindow title={NAME} geometry={GEO} actions={pipActions} dragging>
        <Body />
      </ViewportWindow>
    </div>
  ),
};
