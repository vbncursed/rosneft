import type { RootState } from "@react-three/fiber";
import { fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Chain } from "@/entities/measurement";
import MeasurementLayer from "./measurement-layer";
import { createInPage, unmountInPage } from "./testing";

// The labels and the closer are drei's own <Html>, mounted beside a canvas
// `createInPage` puts in the page, so they are readable through `screen`.
vi.mock("@react-three/drei", async (orig) => ({ ...(await orig<object>()), Line: () => null }));

// The layer asks the store for invalidate, and the spy answers exactly that
// question. The store itself keeps the real one: three's reconciler invalidates
// on every object it adds or removes, and counting those would pass for a
// layer that never repaints on its own.
const invalidate = vi.hoisted(() => vi.fn());
vi.mock("@react-three/fiber", async (orig) => {
  const fiber = await orig<typeof import("@react-three/fiber")>();
  const pick = (selector: (s: RootState) => unknown) => (s: RootState) => {
    const picked = selector(s);
    return picked === s.invalidate ? invalidate : picked;
  };
  return {
    ...fiber,
    useThree: ((selector?: (s: RootState) => unknown) =>
      fiber.useThree(selector && pick(selector))) as typeof fiber.useThree,
  };
});

afterEach(unmountInPage);

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

type LayerOptions = {
  activeChainId?: number | null;
  canEditSaved?: boolean;
  visible?: boolean;
  onCloseActive?: () => void;
};

const layer = (
  chains: Chain[],
  { activeChainId = null, canEditSaved = true, visible = true, onCloseActive = vi.fn() }: LayerOptions = {},
) => (
  <MeasurementLayer
    visible={visible}
    chains={chains}
    activeChainId={activeChainId}
    canEditSaved={canEditSaved}
    unitRatio={1}
    lineColor="#f97316"
    onCloseActive={onCloseActive}
    onRemoveSegment={vi.fn()}
    onRemoveChain={vi.fn()}
  />
);

const draw = (chains: Chain[], options?: LayerOptions) => createInPage(layer(chains, options));

describe("MeasurementLayer", () => {
  it("draws one label per segment — an open chain of N points has N-1", async () => {
    await draw([open]);
    expect(screen.getAllByRole("button")).toHaveLength(2);
  });

  it("keeps the labels but drops the remove buttons on a saved chain the reader cannot edit", async () => {
    const saved: Chain = { ...open, serverId: 7, sync: "saved" };
    const { unmount } = await draw([saved], { canEditSaved: false });
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.getAllByText("1.00 u")).toHaveLength(2);
    await unmount();

    await draw([saved, { ...open, id: 2 }], { canEditSaved: false });
    expect(screen.getAllByRole("button")).toHaveLength(2);
  });

  it("offers no remove button on a chain that is still being saved", async () => {
    await draw([{ ...open, sync: "saving" }], { canEditSaved: true });
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("closes the loop on a closed chain, so N points give N segments", async () => {
    await draw([{ ...open, closed: true }], { activeChainId: 1 });
    expect(screen.getAllByRole("button")).toHaveLength(3);
  });

  it("offers the closer only on the active, still-open chain", async () => {
    const { unmount } = await draw([open], { activeChainId: 1 });
    expect(screen.getByRole("button", { name: "Close measurement chain" })).toBeInTheDocument();
    await unmount();

    await draw([open]);
    expect(screen.queryByRole("button", { name: "Close measurement chain" })).toBeNull();
  });

  it("withholds the closer from a chain with nothing to close into a loop", async () => {
    await draw([{ id: 1, points: [{ x: 0, y: 0, z: 0 }], closed: false, sync: "local" }], { activeChainId: 1 });
    expect(screen.queryByRole("button", { name: "Close measurement chain" })).toBeNull();
  });

  it("closes the active chain when the closer is clicked", async () => {
    const onCloseActive = vi.fn();
    await draw([open], { activeChainId: 1, onCloseActive });
    fireEvent.click(screen.getByRole("button", { name: "Close measurement chain" }));
    expect(onCloseActive).toHaveBeenCalledTimes(1);
  });

  it("draws nothing at all when no chain has been started", async () => {
    await draw([]);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("draws no segment, label or point while hidden, saved and local chains alike", async () => {
    const saved: Chain = { ...open, id: 2, serverId: 7, sync: "saved" };
    const { scene } = await draw([open, saved], { activeChainId: 1, visible: false });
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.queryByText("1.00 u")).toBeNull();
    expect(scene.children).toHaveLength(0);
  });

  it("repaints when it is hidden or shown — the lines live in WebGL", async () => {
    const chains = [open];
    const onCloseActive = vi.fn();
    const shown = (visible: boolean) => layer(chains, { visible, onCloseActive });
    const r = await createInPage(shown(true));
    invalidate.mockClear();
    await r.update(shown(true));
    expect(invalidate).not.toHaveBeenCalled();
    await r.update(shown(false));
    expect(invalidate).toHaveBeenCalledTimes(1);
    await r.update(shown(true));
    expect(invalidate).toHaveBeenCalledTimes(2);
  });
});
