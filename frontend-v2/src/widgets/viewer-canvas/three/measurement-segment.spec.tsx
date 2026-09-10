import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { encodeSegmentId } from "@/entities/measurement";
import MeasurementSegment from "./measurement-segment";

// The label is a DOM overlay drei portals out of the canvas; rendered here
// under react-dom, `<group>` is an unknown element and the chip is readable.
// drei's own Html portal is a no-op outside a live R3F root.
vi.mock("@react-three/drei", () => ({
  Html: ({ children }: { children: ReactNode }) => children,
  Line: () => null,
}));

const segment = { id: encodeSegmentId(4, 2), a: { x: 0, y: 0, z: 0 }, b: { x: 1, y: 0, z: 0 } };

const draw = (props: { onRemoveSegment?: () => void; onRemoveChain?: () => void } = {}) =>
  render(
    <MeasurementSegment
      measurement={segment}
      unitRatio={10}
      lineColor="#f97316"
      onRemoveSegment={props.onRemoveSegment ?? vi.fn()}
      onRemoveChain={props.onRemoveChain ?? vi.fn()}
    />,
  );

describe("MeasurementSegment", () => {
  it("labels the segment in source units, not scene units", () => {
    draw();
    // 1 scene unit × unitRatio 10 = 10 m.
    expect(screen.getByRole("button")).toHaveTextContent("10.00 m");
  });

  it("says both ways out in its title, since neither is visible", () => {
    draw();
    expect(screen.getByRole("button")).toHaveAttribute(
      "title",
      "Click to remove segment · Shift+click to remove whole chain",
    );
  });

  it("removes just this segment on a click, naming the chain and the index", () => {
    const onRemoveSegment = vi.fn();
    draw({ onRemoveSegment });
    fireEvent.click(screen.getByRole("button"));
    expect(onRemoveSegment).toHaveBeenCalledWith(4, 2);
  });

  it("removes the whole chain on shift-click", () => {
    const onRemoveChain = vi.fn();
    const onRemoveSegment = vi.fn();
    draw({ onRemoveChain, onRemoveSegment });
    fireEvent.click(screen.getByRole("button"), { shiftKey: true });
    expect(onRemoveChain).toHaveBeenCalledWith(4);
    expect(onRemoveSegment).not.toHaveBeenCalled();
  });

  it("wears the accent token, not a hard-coded viewer colour", () => {
    draw();
    expect(screen.getByRole("button").className).toContain("border-accent");
    expect(screen.getByRole("button").className).toContain("text-accent");
  });
});
