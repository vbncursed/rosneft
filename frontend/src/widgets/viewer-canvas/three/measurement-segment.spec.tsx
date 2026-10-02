import { fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { encodeSegmentId } from "@/entities/measurement";
import MeasurementSegment from "./measurement-segment";
import { createInPage, unmountInPage } from "./testing";

// The label is drei's own <Html>, which mounts its DOM beside the canvas —
// `createInPage` puts one in the page, so the chip is readable through
// `screen`. Only the line, WebGL through and through, is a double.
const lineColors: string[] = [];
const lineProps: Record<string, unknown>[] = [];
vi.mock("@react-three/drei", async (orig) => ({
  ...(await orig<object>()),
  Line: (props: { color: string }) => {
    lineColors.push(props.color);
    lineProps.push(props);
    return null;
  },
}));

const segment = { id: encodeSegmentId(4, 2), a: { x: 0, y: 0, z: 0 }, b: { x: 1, y: 0, z: 0 } };

const draw = (props: { onRemoveSegment?: () => void; onRemoveChain?: () => void; removable?: boolean } = {}) =>
  createInPage(
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
afterEach(unmountInPage);

describe("MeasurementSegment", () => {
  it("draws the line in the colour the theme handed down, once", async () => {
    // three takes no CSS variables, so the accent arrives as a prop; a
    // hard-coded viewer colour here is what the port replaced.
    await draw();
    expect(lineColors).toEqual(["#f97316"]);
  });

  it("labels the segment in source units, not scene units", async () => {
    await draw();
    // 1 scene unit × unitRatio 10 = 10 m.
    expect(screen.getByRole("button")).toHaveTextContent("10.00 m");
  });

  it("is a plain label when its chain offers no way to remove it", async () => {
    await draw({ removable: false });
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("10.00 m")).toBeInTheDocument();
    expect(screen.queryByText("×")).toBeNull();
    expect(document.querySelector("svg")).toBeNull();
  });

  it("marks the removable chip with a drawn close icon, not a × character", async () => {
    await draw();
    const chip = screen.getByRole("button");
    expect(chip.querySelector("svg")).not.toBeNull();
    expect(chip).not.toHaveTextContent("×");
  });

  it("says both ways out in its title, since neither is visible", async () => {
    await draw();
    expect(screen.getByRole("button")).toHaveAttribute(
      "title",
      "Click to remove segment · Shift+click to remove whole chain",
    );
  });

  it("removes just this segment on a click, naming the chain and the index", async () => {
    const onRemoveSegment = vi.fn();
    await draw({ onRemoveSegment });
    fireEvent.click(screen.getByRole("button"));
    expect(onRemoveSegment).toHaveBeenCalledWith(4, 2);
  });

  it("removes the whole chain on shift-click", async () => {
    const onRemoveChain = vi.fn();
    const onRemoveSegment = vi.fn();
    await draw({ onRemoveChain, onRemoveSegment });
    fireEvent.click(screen.getByRole("button"), { shiftKey: true });
    expect(onRemoveChain).toHaveBeenCalledWith(4);
    expect(onRemoveSegment).not.toHaveBeenCalled();
  });

  it("wears the accent token, not a hard-coded viewer colour", async () => {
    await draw();
    expect(screen.getByRole("button").className).toContain("border-accent");
    expect(screen.getByRole("button").className).toContain("text-accent");
  });

  // Fully opaque, and drawn last over everything by renderOrder alone:
  // `transparent` only moved it into the sorted queue for nothing.
  it("draws an opaque line outside the transparent queue", async () => {
    await draw();
    expect(lineProps[0].transparent).toBeFalsy();
    expect(lineProps[0].depthTest).toBe(false);
  });

  it("presses the label chip", async () => {
    await draw();
    expect(screen.getByRole("button")).toHaveClass("active:scale-[0.97]", "ease-out");
  });
});
