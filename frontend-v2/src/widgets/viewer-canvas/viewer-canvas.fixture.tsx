import { Suspense } from "react";
import type { Chain } from "@/entities/measurement";
import { ViewerCanvas } from "./index";

const noop = () => undefined;

// No mesh: the grid and the lights render, nothing goes on the wire. The
// ruler is a saved chain lying on the grid, so the switch has something to hide.
const RULER: Chain[] = [
  {
    id: 1,
    serverId: 11,
    points: [
      { x: -1, y: -1.2, z: 0 },
      { x: 1, y: -1.2, z: 0 },
      { x: 1, y: -1.2, z: 1 },
    ],
    closed: false,
    sync: "saved",
  },
];

type CanvasProps = { chains?: Chain[]; showMeasurements?: boolean; measuring?: boolean };

// This is the surface the theme's background colour is measured against.
const Canvas = ({ chains = [], showMeasurements = true, measuring = false }: CanvasProps) => (
  <div className="h-[700px] w-full">
    <Suspense fallback={null}>
      <ViewerCanvas
        slug="demo"
        parentLods={[]}
        targetLod={0}
        placements={[]}
        mode={measuring ? "measure" : "orbit"}
        selectedId={null}
        gizmo="translate"
        snap={false}
        canWrite={false}
        canEditMeasurements={false}
        chains={chains}
        activeChainId={null}
        unitRatio={1}
        resetVersion={0}
        retryVersion={0}
        focusRequest={null}
        activePanorama={null}
        calibrationGhost={null}
        panoramaBitmap={null}
        panoramaStatus="idle"
        panoramaProgress={null}
        panoramaOpacity={1}
        calibrating={false}
        panoramas={[]}
        showMarkers
        showMeasurements={showMeasurements}
        markerLabels={{}}
        move={{ active: false, draggingId: null, livePos: null }}
        cameraPositionRef={{ current: null }}
        cameraYawRef={{ current: null }}
        onPick={noop}
        onActivatePanorama={noop}
        onMarkerGrab={noop}
        onMarkerMove={noop}
        onMarkerDrop={noop}
        onTransformCommit={noop}
        onMeasurePoint={noop}
        onCloseActiveChain={noop}
        onRemoveSegment={noop}
        onRemoveChain={noop}
        onLod={noop}
      />
    </Suspense>
  </div>
);

export default {
  empty: <Canvas />,
  ruler: <Canvas chains={RULER} />,
  "ruler-hidden": <Canvas chains={RULER} showMeasurements={false} />,
  "ruler-hidden-measuring": <Canvas chains={RULER} showMeasurements={false} measuring />,
};
