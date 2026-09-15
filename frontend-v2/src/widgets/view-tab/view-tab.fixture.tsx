import { useState, type ReactNode } from "react";
import type { Detail } from "@/shared/ui/detail-list";
import { insideFooter, LOADING_FOOTER } from "./model/copy";
import type { PanoramaRowView } from "./ui/panorama-row";
import { ViewTab } from "./ui/view-tab";

const FULL_DETAILS: Detail[] = [
  { label: "slug", value: "refinery-block-c", tone: "accent" },
  { label: "units", value: "metres" },
  { label: "vertices", value: "1 284 210" },
  { label: "faces", value: "928 310" },
  { label: "uploaded", value: "4 Sep 2026 · a.ivanova", tone: "muted" },
];

// Inside a panorama the mesh counts are not what the reader is looking at.
const PANORAMA_DETAILS: Detail[] = [
  FULL_DETAILS[0],
  FULL_DETAILS[1],
  FULL_DETAILS[4],
];

const ROWS: PanoramaRowView[] = [
  {
    id: 7,
    title: "Control room, north door",
    thumbUrl: null,
    active: false,
    calibrated: true,
    canEdit: false,
    editing: false,
  },
  {
    id: 8,
    title: "Pump house, south wall",
    thumbUrl: null,
    active: false,
    calibrated: false,
    canEdit: false,
    editing: false,
  },
];

const DOCUMENTS = [
  { id: 3, name: "plan-sheet-03.pdf" },
  { id: 4, name: "safety-zones.pdf" },
];

/** The panel body it is rendered into: 320 open, 300 at 1280 and below. */
function Body({ width = 320, children }: { width?: number; children: ReactNode }) {
  return (
    <div className="p-6">
      <div style={{ width }} className="rounded-card border border-line bg-panel p-3.5 shadow-elevation">
        {children}
      </div>
    </div>
  );
}

function Live({
  details = FULL_DETAILS,
  rows = ROWS,
  documents = DOCUMENTS,
  calibrating = null,
  canWrite = true,
  url,
  footer = LOADING_FOOTER,
  editor = null,
  width,
}: {
  details?: Detail[];
  rows?: PanoramaRowView[];
  documents?: { id: number; name: string }[];
  calibrating?: { title: string } | null;
  canWrite?: boolean;
  url?: string;
  footer?: string | null;
  editor?: ReactNode;
  width?: number;
}) {
  const [showMarkers, setShowMarkers] = useState(true);
  const [moving, setMoving] = useState(false);
  const [link, setLink] = useState(url);

  return (
    <Body width={width}>
      <ViewTab
        details={details}
        panoramas={{
          rows: rows.map((row) => ({ ...row, canEdit: canWrite })),
          calibrating,
          canUpload: canWrite,
          onUpload: () => {},
          onEnter: () => {},
          onExit: () => {},
          onEdit: () => {},
          showMarkers,
          onToggleMarkers: () => setShowMarkers((on) => !on),
          onExitCalibration: () => {},
          canMovePoints: canWrite,
          moving,
          onToggleMove: () => setMoving((on) => !on),
          link: { url: link, canEdit: canWrite, saving: false, onSave: setLink },
          editor,
        }}
        documents={{ rows: documents, canUpload: canWrite, onUpload: () => {}, onOpen: () => {} }}
        footer={footer}
      />
    </Body>
  );
}

const ACTIVE: PanoramaRowView[] = [{ ...ROWS[0], active: true }, ROWS[1]];

/** Task 12 owns the anchor card; until then the editor slot holds its outline. */
const EDITOR_PLACEHOLDER = (
  <div className="rounded-control-lg border border-accent bg-panel-2 p-3 text-xs text-muted">
    Anchor editor (Task 12)
  </div>
);

export default {
  idle: <Live url="https://tour.example/refinery" />,
  calibrating: <Live calibrating={{ title: "Control room, north door" }} />,
  inside: (
    <Live
      details={PANORAMA_DETAILS}
      rows={ACTIVE}
      footer={insideFooter(2)}
      url="https://tour.example/refinery"
    />
  ),
  editor: (
    <Live
      rows={[{ ...ROWS[0], editing: true }, ROWS[1]]}
      calibrating={{ title: "Control room, north door" }}
      editor={EDITOR_PLACEHOLDER}
      footer={null}
    />
  ),
  guest: <Live canWrite={false} url="https://tour.example/refinery" />,
  empty: <Live rows={[]} documents={[]} footer={null} />,
  compact: <Live width={300} url="https://tour.example/refinery" />,
};
