import { Suspense } from "react";
import type { Chain } from "@/entities/measurement";
import { ALL_PHASES_SHOWN } from "@/entities/panorama";
import type { Zone } from "@/entities/zone";
import { ModelCanvas, ViewerCanvas, type SiteProps } from "./index";

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

const NO_CHAINS: Chain[] = [];

// A zone on the grid's floor, so the layer has something to draw without a mesh.
const ZONE: Zone = {
  id: 1,
  title: "Tank row",
  corners: [
    { x: -1, y: -1.2, z: -1 },
    { x: 1, y: -1.2, z: -1 },
    { x: 1, y: -1.2, z: -0.2 },
    { x: -1, y: -1.2, z: -0.2 },
  ],
  tags: [{ slug: "tanks", title: "Tanks" }],
  drawingWidthM: null,
  drawingHeightM: null,
  createdAt: "",
  updatedAt: "",
};
const SITE: SiteProps = {
  zones: [ZONE],
  showZones: true,
  selectedZoneId: null,
  onSelectZone: noop,
  plan: null,
  planOpacity: 1,
  preview: null,
  onGround: noop,
};

type CanvasProps = { chains?: Chain[]; showMeasurements?: boolean; measuring?: boolean; free?: boolean };

// This is the surface the theme's background colour is measured against.
const Canvas = ({ chains = NO_CHAINS, showMeasurements = true, measuring = false, free = false }: CanvasProps) => (
  <div className="h-[700px] w-full">
    <Suspense fallback={null}>
      <ViewerCanvas
        slug="demo"
        parentLods={[]}
        targetLod={0}
        placements={[]}
        placementGroups={[]}
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
        playing={false}
        free={free}
        walk={false}
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
        panoramaPhaseHidden={ALL_PHASES_SHOWN}
        showMarkers
        markerNames
        showMeasurements={showMeasurements}
        markerLabels={{}}
        move={{ active: false, draggingId: null, livePos: null }}
        cameraPositionRef={{ current: null }}
        cameraYawRef={{ current: null }}
        site={SITE}
        pickScene={false}
        onPick={noop}
        onPlayStop={noop}
        onWalkRefused={noop}
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

const Model = () => (
  <div className="h-[560px] w-full">
    <Suspense fallback={null}>
      <ModelCanvas lods={[]} retryVersion={0} onLod={noop} onUnavailable={noop} />
    </Suspense>
  </div>
);

export default {
  empty: <Canvas />,
  ruler: <Canvas chains={RULER} />,
  "ruler-hidden": <Canvas chains={RULER} showMeasurements={false} />,
  "ruler-hidden-measuring": <Canvas chains={RULER} showMeasurements={false} measuring />,
  freeCam: <Canvas free />,
  model: <Model />,
};
