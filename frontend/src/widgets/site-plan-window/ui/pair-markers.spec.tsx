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

  it("keeps a constant on-screen size at any zoom", () => {
    render(<PairMarkers pairs={[{ pdf: { x: 1, y: 1 } }]} pending={null} k={4} toPage={toPage} onDrag={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Move plan point 1" }).style.transform).toContain("scale(0.25)");
  });
});
