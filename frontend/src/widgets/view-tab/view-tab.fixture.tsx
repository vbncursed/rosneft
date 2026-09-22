import { useRef, useState, type ReactNode } from "react";
import type { Panorama } from "@/entities/panorama";
import { nudgePosition } from "@/entities/panorama";
import type { Vec3 } from "@/entities/placement";
import { NUDGE_STEPS } from "@/features/panorama-view";
import type { Detail } from "@/shared/ui/detail-list";
import { insideFooter, LOADING_FOOTER } from "./model/copy";
import { degToRad } from "./model/degrees";
import { useSectionFolds } from "./model/use-section-folds";
import { AnchorCard } from "./ui/anchor-card";
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

const BLANK = { thumbUrl: null, active: false, canEdit: false, editing: false };

const ROWS: PanoramaRowView[] = [
  { ...BLANK, id: 7, title: "Control room, north door", calibrated: true },
  { ...BLANK, id: 8, title: "Pump house, south wall", calibrated: false },
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
  canMove = canWrite,
  url,
  footer = LOADING_FOOTER,
  editor = null,
  width,
  ruler = true,
}: {
  details?: Detail[];
  rows?: PanoramaRowView[];
  documents?: { id: number; name: string }[];
  calibrating?: { title: string } | null;
  canWrite?: boolean;
  canMove?: boolean;
  url?: string;
  footer?: string | null;
  editor?: ReactNode;
  width?: number;
  ruler?: boolean;
}) {
  const [showMarkers, setShowMarkers] = useState(true);
  const [moving, setMoving] = useState(false);
  const [showRuler, setShowRuler] = useState(ruler);
  const [link, setLink] = useState(url);
  // The page's rule: standing in or editing a capture holds the list open.
  const folds = useSectionFolds({
    panoramas: rows.some((row) => row.active || row.editing),
    documents: false,
  });

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
          canMovePoints: canMove,
          moving,
          onToggleMove: () => setMoving((on) => !on),
          link: {
            url: link,
            canEdit: canWrite,
            saving: false,
            onSave: async (next) => {
              setLink(next);
              return true;
            },
          },
          editor,
          fold: folds.panoramas,
        }}
        documents={{
          rows: documents,
          canUpload: canWrite,
          onUpload: () => {},
          onOpen: () => {},
          fold: folds.documents,
        }}
        measurements={{ saved: 2, show: showRuler, onToggle: () => setShowRuler((on) => !on) }}
        footer={footer}
      />
    </Body>
  );
}

const ACTIVE: PanoramaRowView[] = [{ ...ROWS[0], active: true }, ROWS[1]];
const EDITING: PanoramaRowView[] = [{ ...ROWS[0], editing: true }, ROWS[1]];

const PANORAMA: Panorama = {
  id: 7,
  territorySlug: "refinery-block-c",
  slug: "control-room-north-door",
  title: "Control room, north door",
  sourceBlobHash: "9f2c",
  position: { x: 4.82, y: 1.7, z: -2.145 },
  yawOffset: degToRad(137.5),
  defaultYaw: 0,
  updatedAt: "2026-09-04T09:12:00Z",
};

type EditorProps = { inside?: boolean; failed?: boolean; calibrating?: boolean; defaultYaw?: number };

/** The anchor card as a route drives it: live refs, a saved panorama, a draft. */
function Editor({ inside = false, failed = false, calibrating = false, defaultYaw = 0 }: EditorProps) {
  const cameraPositionRef = useRef<Vec3 | null>({ x: 2.4, y: 1.62, z: -0.85 });
  const cameraYawRef = useRef<number | null>(degToRad(212.4));
  const [panorama, setPanorama] = useState<Panorama>({ ...PANORAMA, defaultYaw });
  const [opacity, setOpacity] = useState(0.65);
  const [step, setStep] = useState<number>(NUDGE_STEPS[0].value);
  const [draft, setDraft] = useState({ position: PANORAMA.position, yawOffset: PANORAMA.yawOffset });
  const calibration = {
    opacity,
    onOpacity: setOpacity,
    step,
    onStep: setStep,
    position: draft.position,
    onNudge: (axis: "x" | "y" | "z", delta: number) =>
      setDraft((d) => ({ ...d, position: nudgePosition(d.position, axis, delta) })),
    yawOffset: draft.yawOffset,
    onYaw: (yawOffset: number) => setDraft((d) => ({ ...d, yawOffset })),
    onSave: () => setPanorama((p) => ({ ...p, ...draft })),
    onExit: () => {},
  };

  return (
    <AnchorCard
      panorama={panorama}
      index={{ current: 1, total: 2 }}
      inside={inside}
      failed={failed}
      cameraPositionRef={cameraPositionRef}
      cameraYawRef={cameraYawRef}
      saving={false}
      canDelete
      onSave={(patch) => setPanorama((p) => ({ ...p, ...patch }))}
      onDelete={() => {}}
      onToggleView={() => {}}
      onCalibrate={() => {}}
      onClose={() => {}}
      calibration={calibrating ? calibration : null}
    />
  );
}

export default {
  idle: <Live url="https://tour.example/refinery" />,
  calibrating: <Live calibrating={{ title: "Control room, north door" }} />,
  inside: (
    <Live
      details={PANORAMA_DETAILS}
      rows={ACTIVE}
      // Dragging a point is aimed on the mesh; inside the photo there is
      // nothing to drag it over.
      canMove={false}
      footer={insideFooter(2)}
      url="https://tour.example/refinery"
    />
  ),
  editor: <Live rows={EDITING} editor={<Editor />} footer={null} />,
  "editor-inside": (
    <Live
      details={PANORAMA_DETAILS}
      rows={[{ ...ROWS[0], active: true, editing: true }, ROWS[1]]}
      canMove={false}
      editor={<Editor inside defaultYaw={degToRad(212.4)} />}
      footer={null}
    />
  ),
  "editor-calibrating": (
    <Live rows={EDITING} calibrating={{ title: PANORAMA.title }} editor={<Editor calibrating />} footer={null} />
  ),
  "editor-failed": <Live rows={EDITING} editor={<Editor failed />} footer={null} />,
  "ruler-hidden": <Live ruler={false} url="https://tour.example/refinery" />,
  guest: <Live canWrite={false} url="https://tour.example/refinery" />,
  empty: <Live rows={[]} documents={[]} footer={null} />,
  compact: <Live width={300} url="https://tour.example/refinery" />,
};
