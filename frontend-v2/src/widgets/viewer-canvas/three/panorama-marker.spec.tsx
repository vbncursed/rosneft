import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Panorama } from "@/entities/panorama";

let htmlProps: Record<string, unknown> = {};

vi.mock("@react-three/drei", () => ({
  Html: (props: { children?: ReactNode }) => {
    htmlProps = props;
    return props.children;
  },
}));

const { default: PanoramaMarker } = await import("./panorama-marker");

const panorama: Panorama = {
  id: 1,
  territorySlug: "t",
  slug: "control-room",
  title: "Control room",
  sourceBlobHash: "h",
  position: { x: 1, y: 2, z: 3 },
  yawOffset: 0,
  defaultYaw: 0,
  updatedAt: "",
};

type Props = Parameters<typeof PanoramaMarker>[0];

const mount = (over: Partial<Props> = {}) =>
  render(<PanoramaMarker panorama={panorama} onActivate={vi.fn()} {...over} />);

beforeEach(() => {
  htmlProps = {};
});

describe("PanoramaMarker", () => {
  it("is the way into a panorama from the 3D view", () => {
    const onActivate = vi.fn();
    mount({ onActivate });
    const open = screen.getByRole("button", { name: "Open panorama Control room" });
    expect(open).toHaveAttribute("data-tour", "panorama-marker");
    fireEvent.click(open);
    expect(onActivate).toHaveBeenCalledWith(1);
  });

  it("sits at the panorama's anchor and draws over the scene", () => {
    mount();
    expect(htmlProps.position).toEqual([1, 2, 3]);
    expect(htmlProps.center).toBe(true);
    expect(htmlProps.zIndexRange).toEqual([20, 10]);
  });

  it("grabs rather than opens in move mode", () => {
    const onActivate = vi.fn();
    const onGrab = vi.fn();
    mount({ moveMode: true, onActivate, onGrab });
    const grab = screen.getByRole("button", { name: "Move panorama Control room" });
    fireEvent.pointerDown(grab);
    expect(onGrab).toHaveBeenCalledWith(1);
    fireEvent.click(grab);
    expect(onActivate).not.toHaveBeenCalled();
  });

  it("tracks the cursor while it is being dragged, not its saved anchor", () => {
    mount({ moveMode: true, dragging: true, livePos: { x: 9, y: 8, z: 7 }, onGrab: vi.fn() });
    expect(htmlProps.position).toEqual([9, 8, 7]);
  });

  it("falls back to the anchor when a drag has produced no point yet", () => {
    mount({ moveMode: true, dragging: true, livePos: null, onGrab: vi.fn() });
    expect(htmlProps.position).toEqual([1, 2, 3]);
  });

  it("is a 10 px accent ring with its title beside it", () => {
    mount();
    const ring = screen.getByRole("button");
    expect(ring.className).toContain("size-2.5");
    expect(ring.className).toContain("border-2");
    expect(ring.className).toContain("border-accent");
    expect(ring.className).toContain("bg-panel");
    const label = screen.getByText("Control room");
    expect(label.className).toContain("left-3.5");
    expect(label.className).toContain("-top-1.5");
  });

  it("wears the calibration look: a 12 px filled ring and the chip that says to drag it", () => {
    mount({ calibrating: true, moveMode: true, onGrab: vi.fn() });
    const ring = screen.getByRole("button", { name: "Move panorama Control room" });
    expect(ring.className).toContain("size-3");
    expect(ring.className).toContain("bg-accent-soft");
    expect(ring.className).not.toContain("size-2.5");
    expect(screen.queryByText("Control room")).toBeNull();
    const chip = screen.getByText("anchor · drag to move");
    expect(chip.className).toContain("left-4");
    expect(chip.className).toContain("-top-1.75");
    expect(chip.className).toContain("border-accent");
    expect(chip.className).toContain("rounded-control-sm");
  });

  it("shows one cursor per state and lets the pointer through while dragging", () => {
    const classes = () => screen.getByRole("button").className.split(" ");

    const idle = mount();
    expect(classes()).toContain("cursor-pointer");
    idle.unmount();

    const grabbable = mount({ moveMode: true, onGrab: vi.fn() });
    expect(classes()).toContain("cursor-grab");
    grabbable.unmount();

    const { container } = mount({ moveMode: true, dragging: true, onGrab: vi.fn() });
    expect(classes()).toContain("cursor-grabbing");
    expect(container.firstElementChild?.className).toContain("pointer-events-none");
  });

  // Hover used to scale the ring 125%: motion on every pass of the pointer, a
  // shifted hit area, and no reduced-motion answer. A halo says it instead.
  it("answers hover with a halo, press with a dip, and holds still under reduced motion", () => {
    mount();
    const ring = screen.getByRole("button", { name: "Open panorama Control room" });
    expect(ring.className).not.toMatch(/hover:scale/);
    expect(ring).toHaveClass("hover:ring-4", "hover:ring-accent-soft", "active:scale-95", "motion-reduce:transition-none");
  });

  it("does not dip a ring that is being dragged", () => {
    mount({ moveMode: true, onGrab: vi.fn() });
    expect(screen.getByRole("button", { name: "Move panorama Control room" })).not.toHaveClass("active:scale-95");
  });
});
