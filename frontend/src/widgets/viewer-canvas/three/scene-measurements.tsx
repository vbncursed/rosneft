import type { SceneColors } from "../model/scene-colors";
import type { ViewerCanvasProps } from "../ui/props";
import MeasurementLayer from "./measurement-layer";

type Props = Pick<
  ViewerCanvasProps,
  | "showMeasurements"
  | "mode"
  | "chains"
  | "activeChainId"
  | "canEditMeasurements"
  | "unitRatio"
  | "onCloseActiveChain"
  | "onRemoveSegment"
  | "onRemoveChain"
> & { colors: SceneColors };

export function SceneMeasurements(props: Props) {
  return (
    <MeasurementLayer
      visible={props.showMeasurements || props.mode === "measure"}
      chains={props.chains}
      activeChainId={props.activeChainId}
      canEditSaved={props.canEditMeasurements}
      unitRatio={props.unitRatio}
      lineColor={props.colors.accent}
      onCloseActive={props.onCloseActiveChain}
      onRemoveSegment={props.onRemoveSegment}
      onRemoveChain={props.onRemoveChain}
    />
  );
}
