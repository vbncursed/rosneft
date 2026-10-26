import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { PlanRect } from "@/entities/site-plan";
import { RectOverlay } from "./rect-overlay";

const rect = (x: number): PlanRect => ({
  corners: [
    { x, y: 0 },
    { x: x + 20, y: 0 },
    { x: x + 20, y: 10 },
    { x, y: 10 },
  ],
  widthPt: 20,
  heightPt: 10,
  angle: 0,
});

const base = {
  rects: [rect(0), rect(100)],
  zones: [],
  selected: null,
  metresPerPt: 0.5,
  k: 2,
  pageSize: { width: 200, height: 100 },
  onSelect: vi.fn(),
};

describe("RectOverlay", () => {
  it("clips each button to its rectangle's outline", () => {
    render(<RectOverlay {...base} />);
    const [first] = screen.getAllByRole("button");
    expect(first.style.clipPath).toBe("polygon(0% 0%,100% 0%,100% 100%,0% 100%)");
    expect(first.style.left).toBe("0px");
  });

  it("reports the index of the rectangle pressed", async () => {
    const onSelect = vi.fn();
    render(<RectOverlay {...base} onSelect={onSelect} />);
    await userEvent.click(screen.getAllByRole("button")[1]);
    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it("titles each zone at its centre", () => {
    const corners = [
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 20 },
      { x: 0, y: 20 },
    ];
    const { container } = render(<RectOverlay {...base} zones={[{ id: 1, title: "Crane", corners }]} />);
    const label = screen.getByText("Crane");
    expect([label.getAttribute("x"), label.getAttribute("y")]).toEqual(["20", "10"]);
    expect(container.querySelectorAll("polygon").length).toBe(3);
  });
});
