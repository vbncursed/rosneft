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
  MOVE_POINTS,
  PANORAMAS_OVERLINE,
  UPLOAD_DOCUMENT_TITLE,
  UPLOAD_PANORAMA_TITLE,
} from "../model/copy";
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
  };
  documents: {
    rows: { id: number; name: string }[];
    canUpload: boolean;
    onUpload: () => void;
    onOpen: (id: number) => void;
  };
  /** The sentence under both sections — the loading note, or what the photo marks. */
  footer: string | null;
};

const SECTION = "flex flex-col gap-[9px]";
const LIST = "m-0 flex list-none flex-col gap-[9px] p-0";
const KBD = "rounded-[4px] border border-accent-line px-[5px] py-px font-mono text-[10px]";

/**
 * The Overlays panel's View tab: the scene's facts, its panoramas and the PDFs
 * laid over it. It scrolls in the panel body it is rendered into and adds no
 * scrolling container of its own.
 */
export function ViewTab({ details, panoramas, documents, footer }: ViewTabProps) {
  const markersId = useId();

  return (
    <div className="flex flex-col gap-4">
      <DetailList items={details} />

      <section aria-label={PANORAMAS_OVERLINE} className={SECTION}>
        <SectionHead
          overline={PANORAMAS_OVERLINE}
          count={String(panoramas.rows.length)}
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
            {CALIBRATION_LINE} <kbd className={KBD}>V</kbd>{" "}
            <button
              type="button"
              onClick={panoramas.onExitCalibration}
              // Named after its subject: the callout says which panorama only
              // through the anchor card beside it.
              aria-label={`${EXIT_CALIBRATION} of ${panoramas.calibrating.title}`}
              className="ml-1 cursor-pointer rounded-control border border-accent bg-panel px-3 py-1.5 text-xs text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {EXIT_CALIBRATION}
            </button>
          </Callout>
        ) : null}

        {panoramas.rows.length > 0 ? (
          <ul role="list" data-tour="panorama-picker" className={LIST}>
            {panoramas.rows.map((row) => (
              <li key={row.id}>
                <PanoramaRow
                  row={row}
                  onEnter={panoramas.onEnter}
                  onExit={panoramas.onExit}
                  onEdit={panoramas.onEdit}
                />
              </li>
            ))}
          </ul>
        ) : null}

        <div data-tour="toggle-markers" className="flex items-center justify-between gap-2.5">
          <span id={markersId} className="font-mono text-[10px] text-fg">
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
                  "flex cursor-pointer items-center gap-1.5 border-none bg-transparent p-0 font-mono text-[10px] uppercase tracking-[0.1em] text-accent focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent",
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

      <section aria-label={DOCUMENTS_OVERLINE} className={SECTION}>
        <SectionHead
          overline={DOCUMENTS_OVERLINE}
          count={documentsCount(documents.rows.length)}
          upload={
            documents.canUpload
              ? { title: UPLOAD_DOCUMENT_TITLE, tourId: "add-document", onClick: documents.onUpload }
              : undefined
          }
        />
        {documents.rows.length > 0 ? (
          <ul role="list" className={LIST}>
            {documents.rows.map((row) => (
              <li key={row.id}>
                <DocumentRow id={row.id} name={row.name} onOpen={documents.onOpen} />
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      {footer ? <p className="m-0 text-[11px] leading-[1.55] text-muted">{footer}</p> : null}
    </div>
  );
}
