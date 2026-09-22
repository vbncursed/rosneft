import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { encodeSegmentId } from "@/entities/measurement";
import MeasurementSegment from "./measurement-segment";

// The label is a DOM overlay drei portals out of the canvas; rendered here
// under react-dom, `<group>` is an unknown element and the chip is readable.
// drei's own Html portal is a no-op outside a live R3F root.
const lineColors: string[] = [];
const lineProps: Record<string, unknown>[] = [];
vi.mock("@react-three/drei", () => ({
  Html: ({ children }: { children: ReactNode }) => children,
  Line: (props: { color: string }) => {
    lineColors.push(props.color);
    lineProps.push(props);
    return null;
  },
}));

const segment = { id: encodeSegmentId(4, 2), a: { x: 0, y: 0, z: 0 }, b: { x: 1, y: 0, z: 0 } };

const draw = (
  props: { onRemoveSegment?: () => void; onRemoveChain?: () => void; removable?: boolean } = {},
) =>
  render(
    <MeasurementSegment
      measurement={segment}
      unitRatio={10}
      lineColor="#f97316"
      removable={props.removable ?? true}
      onRemoveSegment={props.onRemoveSegment ?? vi.fn()}
      onRemoveChain={props.onRemoveChain ?? vi.fn()}
    />,
  );

beforeEach(() => {
  lineColors.length = 0;
  lineProps.length = 0;
});

describe("MeasurementSegment", () => {
  it("draws the line in the colour the theme handed down, once", () => {
    // three takes no CSS variables, so the accent arrives as a prop; a
    // hard-coded viewer colour here is what the port replaced.
    draw();
    expect(lineColors).toEqual(["#f97316"]);
  });

  it("labels the segment in source units, not scene units", () => {
    draw();
    // 1 scene unit × unitRatio 10 = 10 m.
    expect(screen.getByRole("button")).toHaveTextContent("10.00 m");
  });

  it("is a plain label when its chain offers no way to remove it", () => {
    draw({ removable: false });
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("10.00 m")).toBeInTheDocument();
    expect(screen.queryByText("×")).toBeNull();
    expect(document.querySelector("svg")).toBeNull();
  });

  it("marks the removable chip with a drawn close icon, not a × character", () => {
    draw();
    const chip = screen.getByRole("button");
    expect(chip.querySelector("svg")).not.toBeNull();
    expect(chip).not.toHaveTextContent("×");
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

  // Fully opaque, and drawn last over everything by renderOrder alone:
  // `transparent` only moved it into the sorted queue for nothing.
  it("draws an opaque line outside the transparent queue", () => {
    draw();
    expect(lineProps[0].transparent).toBeFalsy();
    expect(lineProps[0].depthTest).toBe(false);
  });

  it("presses the label chip", () => {
    draw();
    expect(screen.getByRole("button")).toHaveClass("active:scale-[0.97]", "ease-out");
  });
});
