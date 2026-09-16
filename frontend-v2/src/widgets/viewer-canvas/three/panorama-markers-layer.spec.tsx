import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { Panorama } from "@/entities/panorama";

vi.mock("@react-three/drei", () => ({
  Html: ({ children }: { children?: ReactNode }) => children,
}));

const { default: PanoramaMarkersLayer } = await import("./panorama-markers-layer");

const panorama = (id: number): Panorama => ({
  id,
  territorySlug: "t",
  slug: `p${id}`,
  title: `Panorama ${id}`,
  sourceBlobHash: "h",
  position: { x: id, y: 0, z: 0 },
  yawOffset: 0,
  defaultYaw: 0,
  updatedAt: "",
});

type Props = Parameters<typeof PanoramaMarkersLayer>[0];

const mount = (over: Partial<Props> = {}) =>
  render(
    <PanoramaMarkersLayer
      panoramas={[panorama(1), panorama(2), panorama(3)]}
      onActivate={vi.fn()}
      {...over}
    />,
  );

describe("PanoramaMarkersLayer", () => {
  it("draws one marker per panorama", () => {
    mount();
    expect(screen.getAllByRole("button")).toHaveLength(3);
    expect(screen.getByRole("button", { name: "Open panorama Panorama 2" })).toBeInTheDocument();
  });

  it("draws nothing when the territory has no panoramas", () => {
    const { container } = mount({ panoramas: [] });
    expect(container).toBeEmptyDOMElement();
  });

  it("does not draw the anchor the reader is standing on while it is calibrated", () => {
    // The camera is pinned onto that anchor, so its marker would project onto
    // the eye and land in the corner of the viewport. The nudge row and
    // `Set from camera` are what move it; the rest stay for reference.
    mount({ editingId: 2 });
    expect(screen.queryByRole("button", { name: /Panorama 2/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open panorama Panorama 1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open panorama Panorama 3" })).toBeInTheDocument();
  });

  it("marks only the grabbed one as dragging, and the rest stay grabbable", () => {
    mount({ moveMode: true, draggingId: 2, livePos: { x: 9, y: 9, z: 9 }, onGrab: vi.fn() });
    const classes = (id: number) =>
      screen
        .getByRole("button", { name: `Move panorama Panorama ${id}` })
        .className.split(" ");
    expect(classes(2)).toContain("cursor-grabbing");
    expect(classes(1)).toContain("cursor-grab");
    expect(classes(3)).toContain("cursor-grab");
  });
});
