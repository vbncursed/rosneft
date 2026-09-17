import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const positions: unknown[] = [];

vi.mock("@react-three/drei", () => ({
  Html: ({ position, children }: { position?: unknown; children?: ReactNode }) => {
    positions.push(position);
    return children;
  },
}));

const { default: PlacementMarkers } = await import("./placement-markers");
const { fakePlacement } = await import("./testing");

beforeEach(() => {
  positions.length = 0;
});

describe("PlacementMarkers", () => {
  it("labels every placement the panorama shows, at its own position", () => {
    render(
      <PlacementMarkers
        placements={[fakePlacement(1), fakePlacement(2)]}
        labels={{ 1: "storage-tank-500 #1", 2: "storage-tank-500 #2" }}
      />,
    );
    expect(screen.getByText("storage-tank-500 #1")).toBeInTheDocument();
    expect(screen.getByText("storage-tank-500 #2")).toBeInTheDocument();
    expect(positions).toEqual([
      [1, 0, 0],
      [2, 0, 0],
    ]);
  });

  it("skips a placement nothing has named rather than drawing an empty ring", () => {
    render(<PlacementMarkers placements={[fakePlacement(1), fakePlacement(2)]} labels={{ 2: "b" }} />);
    expect(screen.getByText("b")).toBeInTheDocument();
    expect(positions).toEqual([[2, 0, 0]]);
  });

  it("is a passive overlay — the ring never eats a click meant for the object", () => {
    const { container } = render(
      <PlacementMarkers placements={[fakePlacement(1)]} labels={{ 1: "a" }} />,
    );
    expect(screen.queryByRole("button")).toBeNull();
    expect(container.firstElementChild?.className).toContain("pointer-events-none");
  });
});
