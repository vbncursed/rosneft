import { useState } from "react";
import type { Document } from "@/entities/document";
import { DocumentWindow, type DocumentWindowProps } from "./ui/document-window";

const FILE = "plan-sheet-03.pdf";

const doc: Document = {
  id: 1,
  territorySlug: "refinery-block-c",
  title: FILE,
  sourceBlobHash: "h1",
  createdAt: "2026-09-01T00:00:00Z",
};

const GEO = { x: 300, y: 100, w: 560, h: 400 };
const pip = { geo: GEO, dragging: false, startMove: () => {}, startResize: () => {} };

/** A 1200×700 relative box standing in for the viewer scene the window floats above. */
function Stage({
  initial,
  canDelete = true,
}: {
  initial: DocumentWindowProps["window"];
  canDelete?: boolean;
}) {
  const [mode, setMode] = useState(initial);
  return (
    <div className="relative h-[700px] w-[1200px] bg-bg">
      <DocumentWindow
        document={doc}
        window={mode}
        canDelete={canDelete}
        pip={pip}
        onWindow={setMode}
        onDelete={() => {}}
        onExit={() => {}}
        // Cosmos cannot load pdf.js's viewer without the gateway.
        frameSrc="about:blank"
      />
    </div>
  );
}

export default {
  pip: <Stage initial="pip" />,
  expanded: <Stage initial="expanded" />,
  collapsed: <Stage initial="collapsed" />,
  "no-delete": <Stage initial="pip" canDelete={false} />,
};
