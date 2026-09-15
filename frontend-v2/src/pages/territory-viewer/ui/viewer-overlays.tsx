import { documentFileName } from "@/entities/document";
import { Button } from "@/shared/ui/button";
import { KeycapHint } from "@/shared/ui/keycap-hint";
import { LodSwitcher } from "@/shared/ui/lod-switcher";
import { ModeChip } from "@/shared/ui/mode-chip";
import { StatsStrip } from "@/shared/ui/stats-strip";
import { ToolRail, type ToolRailItem } from "@/shared/ui/tool-rail";
import { CollapsedPill, DocumentWindow } from "@/widgets/document-window";
import { SWITCH_TO_3D } from "@/widgets/view-tab";
import type { ViewerOverlaysProps } from "../model/page-props";
import type { RailTool } from "../model/viewer-view";
import { ViewerError } from "./viewer-error";

/**
 * The mock's glyph, name and tour anchor per tile. The page decides the state.
 *
 * `toggle` marks the two that are modes; Reset camera and Replay tour happen
 * once when pressed, and `aria-pressed` on those reads as a toggle that stays on.
 */
const TILES: Record<RailTool, { glyph: string; name: string; toggle?: boolean; dataTour?: string }> = {
  reset: { glyph: "↺", name: "Reset camera", dataTour: "reset-camera" },
  measure: { glyph: "↔", name: "Measure (M)", toggle: true, dataTour: "measure" },
  add: { glyph: "＋", name: "Add objects", toggle: true, dataTour: "add-object" },
  panoramas: { glyph: "◎", name: "Panoramas", toggle: true, dataTour: "panoramas" },
  documents: { glyph: "▤", name: "Documents", toggle: true, dataTour: "documents" },
  tour: { glyph: "▶", name: "Replay guided tour" },
};

// The switcher and the hint bar both stop at the panel's edge; `--overlays-w`
// is declared on the viewport container by the page, from the same
// `overlaysWidthClass` the panel itself uses, so the two cannot drift.
const PANEL_EDGE = "right-[calc(var(--overlays-w)+28px)]";

/**
 * Two layers, because the window is placed two different ways.
 *
 * Floating (pip, and collapsed behind its pill): the layer IS the area the
 * window may be docked and dragged in, because `usePipWindow` measures it —
 * the viewport container, minus the stats-strip row at the bottom and minus
 * the Overlays panel at the right. The header is already outside it. Measured
 * against the browser window instead, the docked title bar's
 * Expand/Hide/Delete/Exit cluster landed underneath the panel, and dragging
 * the window up put the whole bar off the top of the screen.
 *
 * Expanded: the window fills the viewport container at the 14 inset, which is
 * the container itself.
 *
 * `left-0` rather than `inset-x-0`: `right` is set right beside it, and one
 * property belongs in one place — the two would be resolved by the
 * stylesheet's source order, not by the order they are written in.
 */
// Both layers are transparent and cover everything under them, so they pass
// clicks straight through and `ViewportWindow` takes its own back. Without
// that the tool rail, the mode chip, the stats strip and the collapsed
// document's own pill are all dead while a PDF is open. Same pair, same
// reason, as the Toaster's cards.
const DOC_FLOATING = `pointer-events-none absolute left-0 top-0 bottom-11 ${PANEL_EDGE}`;
const DOC_EXPANDED = "pointer-events-none absolute inset-0";

/**
 * The strip and the collapsed document's pill share one row, so the pill sits
 * 14px past the strip's *real* right edge. The strip's width is the scene's —
 * `LOD 1 active` and `LOD 1 active · LOD 0 loading` differ by ~96px — so an
 * offset measured off the usual strip puts the pill under it the moment a
 * level downloads.
 */
const BOTTOM_ROW = "absolute left-3.5 flex items-center gap-3.5";

const HINT_BAR =
  "absolute left-3.5 bottom-3.5 flex items-center justify-center gap-[9px] rounded-[10px] border border-accent-line bg-panel px-3.5 py-[9px] font-mono text-[10px] text-fg shadow-elevation";

const Dot = () => (
  <span aria-hidden="true" className="text-dim">
    ·
  </span>
);

const Key = ({ children }: { children: string }) => (
  <kbd className="rounded-[4px] border border-line-2 px-[5px] py-px text-fg">{children}</kbd>
);

/**
 * Everything drawn over the canvas: the tool rail and what the pointer is
 * doing, the level picker, the scene's facts, the measure affordances and —
 * when the mesh never arrived — the error card in place of the scene.
 *
 * Every child is absolutely positioned against the viewport the page owns, and
 * every value it draws is a prop: the canvas is a boundary, so nothing here
 * reaches into the scene for an answer.
 */
export function ViewerOverlays({
  tools,
  onReset,
  onMeasure,
  onAdd,
  onPanoramas,
  onDocuments,
  onReplayTour,
  chip,
  loading,
  measuring,
  switcher,
  strip,
  hints,
  error,
  switchTo3d,
  document: doc,
  documentLayerRef,
}: ViewerOverlaysProps) {
  const handlers: Record<RailTool, () => void> = {
    reset: onReset,
    measure: onMeasure,
    add: onAdd,
    panoramas: onPanoramas,
    documents: onDocuments,
    tour: onReplayTour,
  };
  const items: ToolRailItem[] = tools.map(({ key, state }) => ({
    key,
    state,
    onClick: handlers[key],
    ...TILES[key],
  }));

  return (
    <>
      {loading ? (
        <div
          role="progressbar"
          aria-label={`Loading LOD ${loading.target}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={loading.percent}
          className="absolute inset-x-0 top-0 h-0.5 bg-line"
        >
          <div
            className="h-full bg-accent transition-[width] duration-300"
            style={{ width: `${loading.percent}%` }}
          />
        </div>
      ) : null}

      <div className="absolute left-3.5 top-3.5 flex flex-col items-start gap-2">
        <ToolRail label="Viewer tools" tools={items} />
        {loading ? (
          <>
            <ModeChip label="Loading" spinning icon="refresh">
              Loading model
            </ModeChip>
            {/* Named, so the download is announced: this chip and the
                progressbar above it are the only things that say a better level
                is on its way. */}
            <ModeChip label="Loading progress" tone="neutral">
              {loading.chip}
            </ModeChip>
          </>
        ) : chip ? (
          <ModeChip label="Pointer mode" kbd={chip.kbd}>
            {chip.text}
          </ModeChip>
        ) : null}
        {switchTo3d ? (
          <Button size="sm" onClick={switchTo3d} className="shadow-elevation">
            {SWITCH_TO_3D}
          </Button>
        ) : null}
        {measuring ? (
          <div className="flex items-center gap-1.5">
            <Button size="sm" disabled={!measuring.canClear} onClick={measuring.onClear}>
              Clear
            </Button>
            <Button size="sm" disabled={!measuring.canClose} onClick={measuring.onCloseChain}>
              Close measurement chain
            </Button>
          </div>
        ) : null}
      </div>

      {switcher ? <LodSwitcher {...switcher} className={`absolute top-3.5 ${PANEL_EDGE}`} /> : null}

      <div className={`${BOTTOM_ROW} ${measuring ? "bottom-[60px]" : "bottom-3.5"}`}>
        <StatsStrip items={strip.items} tone={strip.tone} accentLast={strip.accentLast} />
        {doc?.window === "collapsed" ? (
          <CollapsedPill
            file={documentFileName(doc.document)}
            onShow={() => doc.onWindow("pip")}
          />
        ) : null}
      </div>

      {hints ? (
        <div
          role="note"
          aria-label="Keyboard hints"
          className="absolute bottom-3.5 right-[74px] flex items-center gap-1.5"
        >
          <KeycapHint keyLabel="M">measure</KeycapHint>
          <KeycapHint keyLabel="Esc">exit / deselect</KeycapHint>
        </div>
      ) : null}

      {measuring ? (
        <div role="note" aria-label="Measure tool" className={`${HINT_BAR} ${PANEL_EDGE}`}>
          <span>Click two points</span>
          <Dot />
          <span>
            <Key>Shift</Key>+click removes the chain
          </span>
          <Dot />
          <span>
            <Key>Esc</Key> exits
          </span>
        </div>
      ) : null}

      {/* Mounted whether or not a document is open: it is the box the pip
          docks into, and `usePipWindow` measures it on mount. */}
      <div
        ref={documentLayerRef}
        data-testid="document-layer"
        className={doc?.window === "expanded" ? DOC_EXPANDED : DOC_FLOATING}
      >
        {/* The pill is the row's above, where the strip's width decides it. */}
        {doc ? <DocumentWindow {...doc} showPill={false} /> : null}
      </div>

      {error ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-3.5">
          <div className="pointer-events-auto">
            <ViewerError {...error} />
          </div>
        </div>
      ) : null}
    </>
  );
}
