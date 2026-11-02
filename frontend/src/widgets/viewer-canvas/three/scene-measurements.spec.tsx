import { render } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { SceneMeasurements } from "./scene-measurements";

const layer = vi.hoisted(() => vi.fn());
vi.mock("./measurement-layer", () => ({
  default: (props: unknown) => {
    layer(props);
    return null;
  },
}));

it("shows measurements in measure mode even when the switch is off", () => {
  render(
    <SceneMeasurements
      showMeasurements={false}
      mode="measure"
      chains={[]}
      activeChainId={null}
      canEditMeasurements={false}
      unitRatio={1}
      colors={{ accent: "red" } as never}
      onCloseActiveChain={vi.fn()}
      onRemoveSegment={vi.fn()}
      onRemoveChain={vi.fn()}
    />,
  );
  expect(layer).toHaveBeenCalledWith(expect.objectContaining({ visible: true }));
});
