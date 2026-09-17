import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { Chain } from "@/entities/measurement";
import MeasurementLayer from "./measurement-layer";

// Rendered under react-dom so the labels and the closer button are readable:
// `<group>` is an unknown element, and drei's Html portal is inert outside a
// live R3F root.
vi.mock("@react-three/drei", () => ({
  Html: ({ children }: { children: ReactNode }) => children,
  Line: () => null,
}));
vi.mock("@react-three/fiber", () => {
  const invalidate = () => {};
  return { useThree: () => invalidate };
});

const open: Chain = {
  id: 1,
  points: [
    { x: 0, y: 0, z: 0 },
    { x: 1, y: 0, z: 0 },
    { x: 1, y: 0, z: 1 },
  ],
  closed: false,
  sync: "local",
};

const draw = (chains: Chain[], activeChainId: number | null) =>
  render(
    <MeasurementLayer
      chains={chains}
      activeChainId={activeChainId}
      unitRatio={1}
      lineColor="#f97316"
      onCloseActive={vi.fn()}
      onRemoveSegment={vi.fn()}
      onRemoveChain={vi.fn()}
    />,
  );

describe("MeasurementLayer", () => {
  it("draws one label per segment — an open chain of N points has N-1", () => {
    draw([open], null);
    expect(screen.getAllByRole("button")).toHaveLength(2);
  });

  it("closes the loop on a closed chain, so N points give N segments", () => {
    draw([{ ...open, closed: true }], 1);
    expect(screen.getAllByRole("button")).toHaveLength(3);
  });

  it("offers the closer only on the active, still-open chain", () => {
    const { unmount } = draw([open], 1);
    expect(screen.getByRole("button", { name: "Close measurement chain" })).toBeInTheDocument();
    unmount();

    draw([open], null);
    expect(screen.queryByRole("button", { name: "Close measurement chain" })).toBeNull();
  });

  it("withholds the closer from a chain with nothing to close into a loop", () => {
    draw([{ id: 1, points: [{ x: 0, y: 0, z: 0 }], closed: false, sync: "local" }], 1);
    expect(screen.queryByRole("button", { name: "Close measurement chain" })).toBeNull();
  });

  it("closes the active chain when the closer is clicked", () => {
    const onCloseActive = vi.fn();
    render(
      <MeasurementLayer
        chains={[open]}
        activeChainId={1}
        unitRatio={1}
        lineColor="#f97316"
        onCloseActive={onCloseActive}
        onRemoveSegment={vi.fn()}
        onRemoveChain={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Close measurement chain" }));
    expect(onCloseActive).toHaveBeenCalledTimes(1);
  });

  it("draws nothing at all when no chain has been started", () => {
    draw([], null);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});
