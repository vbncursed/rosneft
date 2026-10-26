import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PairMarkers } from "./pair-markers";

describe("PairMarkers", () => {
  const toPage = (x: number, y: number) => ({ x, y });

  it("ignores keys that are not arrows", () => {
    const onDrag = vi.fn();
    render(<PairMarkers pairs={[{ pdf: { x: 1, y: 1 } }]} pending={null} k={1} toPage={toPage} onDrag={onDrag} />);
    fireEvent.keyDown(screen.getByRole("button", { name: "Move plan point 1" }), { key: "a" });
    expect(onDrag).not.toHaveBeenCalled();
  });

  it.each([
    ["cancelled", fireEvent.pointerCancel],
    ["lost", fireEvent.lostPointerCapture],
  ] as const)("stops a drag whose pointer was %s", (_name, end) => {
    const onDrag = vi.fn();
    render(<PairMarkers pairs={[{ pdf: { x: 1, y: 1 } }]} pending={null} k={1} toPage={toPage} onDrag={onDrag} />);
    const marker = screen.getByRole("button", { name: "Move plan point 1" });
    fireEvent.pointerDown(marker);
    end(marker);
    fireEvent.pointerMove(marker, { clientX: 5, clientY: 5, buttons: 1 });
    expect(onDrag).not.toHaveBeenCalled();
  });

  it("stops a drag whose button was released out of sight", () => {
    const onDrag = vi.fn();
    render(<PairMarkers pairs={[{ pdf: { x: 1, y: 1 } }]} pending={null} k={1} toPage={toPage} onDrag={onDrag} />);
    const marker = screen.getByRole("button", { name: "Move plan point 1" });
    fireEvent.pointerDown(marker);
    fireEvent.pointerMove(marker, { clientX: 5, clientY: 5, buttons: 0 });
    fireEvent.pointerMove(marker, { clientX: 6, clientY: 6, buttons: 1 });
    expect(onDrag).not.toHaveBeenCalled();
  });

  it("keeps a constant on-screen size at any zoom", () => {
    render(<PairMarkers pairs={[{ pdf: { x: 1, y: 1 } }]} pending={null} k={4} toPage={toPage} onDrag={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Move plan point 1" }).style.transform).toContain("scale(0.25)");
  });
});
