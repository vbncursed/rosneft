import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import PointMarker from "./point-marker";

vi.mock("@react-three/drei", () => ({
  Html: ({ children }: { children: ReactNode }) => children,
}));

const at = { x: 1, y: 2, z: 3 };

describe("PointMarker", () => {
  it("draws a passive vertex that clicks fall straight through", () => {
    const { container } = render(<PointMarker position={at} />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(container.firstElementChild?.className).toContain("pointer-events-none");
  });

  it("offers the active chain's first vertex as the way to close the loop", () => {
    const onClick = vi.fn();
    render(<PointMarker position={at} variant="active-start" onClick={onClick} />);
    const closer = screen.getByRole("button", { name: "Close measurement chain" });
    fireEvent.click(closer);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("gives the closer the larger, haloed shape so it reads as the one to click", () => {
    render(<PointMarker position={at} variant="active-start" />);
    const closer = screen.getByRole("button");
    expect(closer.className).toContain("size-4");
    expect(closer.className).toContain("ring-accent-soft");
  });

  it("survives a click with no handler attached", () => {
    render(<PointMarker position={at} variant="active-start" />);
    expect(() => fireEvent.click(screen.getByRole("button"))).not.toThrow();
  });

  it("answers hover on the closer with a wider halo, not a scale, and holds still under reduced motion", () => {
    render(<PointMarker position={at} variant="active-start" />);
    const closer = screen.getByRole("button");
    expect(closer.className).not.toMatch(/hover:scale/);
    expect(closer).toHaveClass("hover:ring-[6px]", "active:scale-95", "ease-out", "motion-reduce:transition-none");
  });
});
