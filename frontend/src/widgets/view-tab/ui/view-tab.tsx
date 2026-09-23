import { useId, type ReactNode } from "react";
import { clsx as cx } from "clsx";
import { Callout } from "@/shared/ui/callout";
import { DetailList, type Detail } from "@/shared/ui/detail-list";
import { Switch } from "@/shared/ui/switch";
import {
  CALIBRATION_LINE,
  DOCUMENTS_OVERLINE,
  documentsCount,
  EXIT_CALIBRATION,
  MARKERS_SWITCH,
  MEASUREMENTS_OVERLINE,
  MEASUREMENTS_SWITCH,
  measurementsCount,
  MOVE_POINTS,
  PANORAMAS_OVERLINE,
  UPLOAD_DOCUMENT_TITLE,
  UPLOAD_PANORAMA_TITLE,
} from "../model/copy";
import type { SectionFold } from "../model/use-section-folds";
import { DocumentRow } from "./document-row";
import { PanoramaRow, type PanoramaRowView } from "./panorama-row";
import { SectionHead } from "./section-head";
import { ExternalLink, type ExternalLinkProps } from "./external-link";

export type ViewTabProps = {
  /** The scene's own facts: slug, units, vertices, faces, uploaded. */
  details: Detail[];
  panoramas: {
    rows: PanoramaRowView[];
    /** The panorama whose anchor is being dragged; null when none is. */
    calibrating: { title: string } | null;
    canUpload: boolean;
    onUpload: () => void;
    onEnter: (id: number) => void;
    onExit: () => void;
    onEdit: (id: number) => void;
    showMarkers: boolean;
    onToggleMarkers: () => void;
    onExitCalibration: () => void;
    /** `panorama:write` — the grant behind Move points. */
    canMovePoints: boolean;
    moving: boolean;
    onToggleMove: () => void;
    link: ExternalLinkProps;
    /** The anchor card, rendered under the rows. */
    editor: ReactNode;
    /** Folds the rows only; the switches, the link and the editor stay. */
    fold: SectionFold;
  };
  documents: {
    rows: { id: number; name: string }[];
    canUpload: boolean;
    onUpload: () => void;
    onOpen: (id: number) => void;
    fold: SectionFold;
  };
  /**
   * The ruler's switch. Hiding it keeps every chain; measure mode draws them
   * regardless, and that is the canvas's call, not this one's.
   */
  measurements: { saved: number; show: boolean; onToggle: () => void };
  /** The sentence under the sections — the loading note, or what the photo marks. */
  footer: string | null;
};

const SECTION = "flex flex-col gap-[9px]";
const SWITCH_ROW = "flex items-center justify-between gap-2.5";
const SWITCH_LABEL = "font-mono text-[10px] text-fg";
const LIST = "m-0 flex list-none flex-col gap-[9px] p-0";
const KBD = "rounded-[4px] border border-accent-line px-[5px] py-px font-mono text-[10px]";

/**
 * The Overlays panel's View tab: the scene's facts, its panoramas and the PDFs
 * laid over it. It scrolls in the panel body it is rendered into and adds no
 * scrolling container of its own.
 *
 * The Panoramas and Documents sections carry an id: the tool rail's tiles
 * scroll to them (`pages/territory-viewer/model/reveal-section.ts`), and an
 * `aria-label` is not something `getElementById` can find.
 *
 * Their lists fold behind the heads (`useSectionFolds` owns the state). A
 * folded list keeps its `<ul>`, empty and `hidden`, so its head's
 * `aria-controls` always names a real element. It keeps none of its rows,
 * because every row holds an `<img>` and each page render re-rendered them all.
 */
export function ViewTab({ details, panoramas, documents, measurements, footer }: ViewTabProps) {
  const markersId = useId();
  const rulerId = useId();
  const panoramaListId = useId();
  const documentListId = useId();
  // An empty list has nothing to open, so its head stays a plain head.
  const foldOf = (fold: SectionFold, id: string, rows: unknown[]) =>
    rows.length > 0 ? { ...fold, controls: id } : undefined;

  return (
    <div className="flex flex-col gap-4">
      <DetailList items={details} />

      <section id="view-tab-panoramas" aria-label={PANORAMAS_OVERLINE} className={SECTION}>
        <SectionHead
          overline={PANORAMAS_OVERLINE}
          count={String(panoramas.rows.length)}
          fold={foldOf(panoramas.fold, panoramaListId, panoramas.rows)}
          upload={
            panoramas.canUpload
              ? { title: UPLOAD_PANORAMA_TITLE, tourId: "add-panorama", onClick: panoramas.onUpload }
              : undefined
          }
        />

        {panoramas.calibrating ? (
          // The mock draws no glyph here; Callout always carries one, so it
          // takes the section's own.
          <Callout tone="accent" icon="panorama">
            {/* The way out is its own line, as mocks 4/9 draw it: glued to
                the sentence, a narrow panel wrapped it flush left. */}
            <span className="flex flex-col items-start gap-[9px]">
              <span>
                {CALIBRATION_LINE} <kbd className={KBD}>V</kbd>
              </span>
              <button
                type="button"
                onClick={panoramas.onExitCalibration}
                // Named after its subject: the callout says which panorama only
                // through the anchor card beside it.
                aria-label={`${EXIT_CALIBRATION} of ${panoramas.calibrating.title}`}
                className="cursor-pointer rounded-control border border-accent bg-panel px-3 py-1.5 text-xs text-accent transition-[scale] duration-150 ease-out active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                {EXIT_CALIBRATION}
              </button>
            </span>
          </Callout>
        ) : null}

        {panoramas.rows.length > 0 ? (
          <ul
            id={panoramaListId}
            hidden={!panoramas.fold.open}
            role="list"
            data-tour="panorama-picker"
            className={LIST}
          >
            {panoramas.fold.open
              ? panoramas.rows.map((row) => (
                  <li key={row.id}>
                    <PanoramaRow
                      row={row}
                      onEnter={panoramas.onEnter}
                      onExit={panoramas.onExit}
                      onEdit={panoramas.onEdit}
                    />
                  </li>
                ))
              : null}
          </ul>
        ) : null}

        <div data-tour="toggle-markers" className={SWITCH_ROW}>
          <span id={markersId} className={SWITCH_LABEL}>
            {MARKERS_SWITCH}
          </span>
          <span className="flex items-center gap-2.5">
            {panoramas.canMovePoints ? (
              <button
                type="button"
                onClick={panoramas.onToggleMove}
                aria-pressed={panoramas.moving}
                data-tour="move-points"
                className={cx(
                  "flex cursor-pointer items-center gap-1.5 border-none bg-transparent p-0 font-mono text-[10px] uppercase tracking-[0.1em] text-accent transition-[scale] duration-150 ease-out active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent",
                  panoramas.moving ? "underline" : "hover:underline",
                )}
              >
                {MOVE_POINTS}
                {/* The shortcut is a hint, not part of the control's name. */}
                <kbd aria-hidden="true" className={KBD}>
                  V
                </kbd>
              </button>
            ) : null}
            <Switch
              checked={panoramas.showMarkers}
              onChange={panoramas.onToggleMarkers}
              label={MARKERS_SWITCH}
              labelledBy={markersId}
            />
          </span>
        </div>

        <ExternalLink {...panoramas.link} />
        {panoramas.editor}
      </section>

      <section id="view-tab-documents" aria-label={DOCUMENTS_OVERLINE} className={SECTION}>
        <SectionHead
          overline={DOCUMENTS_OVERLINE}
          count={documentsCount(documents.rows.length)}
          fold={foldOf(documents.fold, documentListId, documents.rows)}
          upload={
            documents.canUpload
              ? { title: UPLOAD_DOCUMENT_TITLE, tourId: "add-document", onClick: documents.onUpload }
              : undefined
          }
        />
        {documents.rows.length > 0 ? (
          <ul id={documentListId} hidden={!documents.fold.open} role="list" className={LIST}>
            {documents.fold.open
              ? documents.rows.map((row) => (
                  <li key={row.id}>
                    <DocumentRow id={row.id} name={row.name} onOpen={documents.onOpen} />
                  </li>
                ))
              : null}
          </ul>
        ) : null}
      </section>

      {/* Not in the mock: the ruler has no section there, and no switch. */}
      <section aria-label={MEASUREMENTS_OVERLINE} className={SECTION}>
        <SectionHead overline={MEASUREMENTS_OVERLINE} count={measurementsCount(measurements.saved)} />
        <div className={SWITCH_ROW}>
          <span id={rulerId} className={SWITCH_LABEL}>
            {MEASUREMENTS_SWITCH}
          </span>
          <Switch
            checked={measurements.show}
            onChange={measurements.onToggle}
            label={MEASUREMENTS_SWITCH}
            labelledBy={rulerId}
          />
        </div>
      </section>

      {footer ? <p className="m-0 text-[11px] leading-[1.55] text-muted">{footer}</p> : null}
    </div>
  );
}
