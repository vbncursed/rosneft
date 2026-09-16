import { Suspense } from "react";
import { ViewerCanvas } from "./index";

const noop = () => undefined;

// An empty chain: the grid and the lights render, nothing goes on the wire.
// This is the surface the theme's background colour is measured against.
export default (
  <div className="h-[700px] w-full">
    <Suspense fallback={null}>
      <ViewerCanvas
        slug="demo"
        parentLods={[]}
        targetLod={0}
        placements={[]}
        mode="orbit"
        selectedId={null}
        gizmo="translate"
        snap={false}
        canWrite={false}
        chains={[]}
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
