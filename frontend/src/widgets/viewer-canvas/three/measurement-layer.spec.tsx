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
const invalidate = vi.hoisted(() => vi.fn());
vi.mock("@react-three/fiber", () => ({ useThree: () => invalidate }));

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

const draw = (chains: Chain[], activeChainId: number | null, canEditSaved = true, visible = true) =>
  render(
    <MeasurementLayer
      visible={visible}
      chains={chains}
      activeChainId={activeChainId}
      canEditSaved={canEditSaved}
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

  it("keeps the labels but drops the remove buttons on a saved chain the reader cannot edit", () => {
    const saved: Chain = { ...open, serverId: 7, sync: "saved" };
    const { unmount } = draw([saved], null, false);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.getAllByText("1.00 u")).toHaveLength(2);
    unmount();

    draw([saved, { ...open, id: 2 }], null, false);
    expect(screen.getAllByRole("button")).toHaveLength(2);
  });

  it("offers no remove button on a chain that is still being saved", () => {
    draw([{ ...open, sync: "saving" }], null, true);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
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
        visible
        chains={[open]}
        activeChainId={1}
        canEditSaved
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

  it("draws no segment, label or point while hidden, saved and local chains alike", () => {
    const saved: Chain = { ...open, id: 2, serverId: 7, sync: "saved" };
    const { container } = draw([open, saved], 1, true, false);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.queryByText("1.00 u")).toBeNull();
    expect(container).toBeEmptyDOMElement();
  });

  it("repaints when it is hidden or shown — the lines live in WebGL", () => {
    const chains = [open];
    const { rerender } = draw(chains, null);
    invalidate.mockClear();
    const layer = (visible: boolean) => (
      <MeasurementLayer
        visible={visible}
        chains={chains}
        activeChainId={null}
        canEditSaved
        unitRatio={1}
        lineColor="#f97316"
        onCloseActive={vi.fn()}
        onRemoveSegment={vi.fn()}
        onRemoveChain={vi.fn()}
      />
    );
    rerender(layer(true));
    expect(invalidate).not.toHaveBeenCalled();
    rerender(layer(false));
    expect(invalidate).toHaveBeenCalledTimes(1);
    rerender(layer(true));
    expect(invalidate).toHaveBeenCalledTimes(2);
  });
});
