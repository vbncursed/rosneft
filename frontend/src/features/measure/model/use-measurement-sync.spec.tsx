import { act, renderHook, waitFor } from "@testing-library/react";
import { StrictMode, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StoredChain, SyncGrants } from "@/entities/measurement";
import { HttpError } from "@/shared/api";
import { clearNotices, useNotices } from "@/shared/lib/notify";
import { useMeasurementSync } from "./use-measurement-sync";

const api = vi.hoisted(() => ({
  createMeasurement: vi.fn(),
  updateMeasurement: vi.fn(),
  deleteMeasurement: vi.fn(),
  deleteMeasurements: vi.fn(),
}));
vi.mock("@/entities/measurement", async (actual) => ({
  ...(await actual<typeof import("@/entities/measurement")>()),
  ...api,
}));

const p = (x: number) => ({ x, y: 0, z: 0 });
const ALL: SyncGrants = { create: true, write: true, delete: true };
const SAVED: StoredChain = { serverId: 9, points: [p(0), p(1), p(2), p(3)], closed: false };

type Args = { slug: string; stored: StoredChain[] | null; grants: SyncGrants; onChanged: () => void };

const onChanged = vi.fn();

function mount(args: Partial<Args> = {}, wrapper?: (p: { children: ReactNode }) => ReactNode) {
  const initialProps: Args = { slug: "north", stored: [], grants: ALL, onChanged, ...args };
  return renderHook(
    (props: Args) => ({ tool: useMeasurementSync(props), notices: useNotices() }),
    { initialProps, wrapper },
  );
}

/** Draws a two-point chain and ends it the way Escape does. */
function drawAndFinish(tool: ReturnType<typeof useMeasurementSync>) {
  act(() => {
    tool.click(p(0));
    tool.click(p(5));
    tool.cancelChain();
  });
}

const deferred = <T,>() => {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
};

beforeEach(() => {
  api.createMeasurement.mockImplementation((_slug, body) => Promise.resolve({ serverId: 41, ...body }));
  api.updateMeasurement.mockImplementation((_slug, id, body) => Promise.resolve({ serverId: id, ...body }));
  api.deleteMeasurement.mockResolvedValue(undefined);
  api.deleteMeasurements.mockResolvedValue(undefined);
});
afterEach(() => {
  vi.clearAllMocks();
  clearNotices();
});

describe("useMeasurementSync", () => {
  it("seeds the saved chains once per territory, not again on a refetch", () => {
    const { result, rerender } = mount({ stored: [SAVED] });
    expect(result.current.tool.chains).toMatchObject([{ serverId: 9, sync: "saved" }]);
    rerender({ slug: "north", stored: [SAVED, { ...SAVED, serverId: 10 }], grants: ALL, onChanged });
    expect(result.current.tool.chains).toHaveLength(1);
  });

  it("waits for the bundle before seeding", () => {
    const { result, rerender } = mount({ stored: null });
    expect(result.current.tool.chains).toEqual([]);
    rerender({ slug: "north", stored: [SAVED], grants: ALL, onChanged });
    expect(result.current.tool.chains).toHaveLength(1);
  });

  it("does not seed a new territory while a save is still in flight", async () => {
    const save = deferred<StoredChain>();
    api.createMeasurement.mockReturnValueOnce(save.promise);
    const { result, rerender } = mount();
    drawAndFinish(result.current.tool);
    rerender({ slug: "south", stored: [SAVED], grants: ALL, onChanged });
    expect(result.current.tool.chains.map((c) => c.serverId)).toEqual([undefined]);
    await act(async () => save.resolve({ serverId: 41, points: [p(0), p(5)], closed: false }));
    // The seed replaces the saved chains with the new territory's.
    expect(result.current.tool.chains.map((c) => c.serverId)).toEqual([9]);
  });

  it("saves a chain when it ends, showing it as saving until the row lands", async () => {
    const save = deferred<StoredChain>();
    api.createMeasurement.mockReturnValueOnce(save.promise);
    const { result } = mount({ slug: "a b" });
    drawAndFinish(result.current.tool);
    expect(api.createMeasurement).toHaveBeenCalledExactlyOnceWith("a b", {
      points: [p(0), p(5)],
      closed: false,
    });
    expect(result.current.tool.chains[0].sync).toBe("saving");
    await act(async () => save.resolve({ serverId: 41, points: [p(0), p(5)], closed: false }));
    expect(result.current.tool.chains[0]).toMatchObject({ serverId: 41, sync: "saved" });
  });

  it("sends nothing while a chain is still being drawn, or without the create grant", () => {
    const { result } = mount({ grants: { create: false, write: false, delete: false } });
    act(() => {
      result.current.tool.click(p(0));
      result.current.tool.click(p(5));
    });
    expect(api.createMeasurement).not.toHaveBeenCalled();
    act(() => result.current.tool.cancelChain());
    expect(api.createMeasurement).not.toHaveBeenCalled();
    expect(result.current.tool.chains[0].sync).toBe("local");
  });

  it("sends exactly one request per ended chain under StrictMode", async () => {
    const { result } = mount({}, StrictMode);
    drawAndFinish(result.current.tool);
    await waitFor(() => expect(result.current.tool.chains[0].sync).toBe("saved"));
    expect(api.createMeasurement).toHaveBeenCalledTimes(1);
  });

  it("marks a refused save as failed and offers one Retry that sends it again", async () => {
    api.createMeasurement.mockRejectedValueOnce(new HttpError(500, null, "database down"));
    const { result } = mount();
    drawAndFinish(result.current.tool);
    await waitFor(() => expect(result.current.tool.chains[0].sync).toBe("failed"));
    expect(result.current.notices).toHaveLength(1);
    expect(result.current.notices[0]).toMatchObject({
      tone: "error",
      message: "Measurement not saved: database down",
      action: { label: "Retry" },
    });
    await act(async () => result.current.notices[0].action!.run());
    expect(api.createMeasurement).toHaveBeenCalledTimes(2);
    expect(result.current.tool.chains[0]).toMatchObject({ serverId: 41, sync: "saved" });
  });

  it("cuts a saved chain as one update and one create", async () => {
    const { result } = mount({ stored: [SAVED] });
    const id = result.current.tool.chains[0].id;
    act(() => result.current.tool.removeSegment(id, 1));
    expect(api.updateMeasurement).toHaveBeenCalledExactlyOnceWith("north", 9, {
      points: [p(0), p(1)],
      closed: false,
    });
    expect(api.createMeasurement).toHaveBeenCalledExactlyOnceWith("north", {
      points: [p(2), p(3)],
      closed: false,
    });
    await waitFor(() =>
      expect(result.current.tool.chains.map((c) => [c.serverId, c.sync])).toEqual([
        [9, "saved"],
        [41, "saved"],
      ]),
    );
  });

  it("deletes a removed saved chain, and puts it back when the delete is refused", async () => {
    api.deleteMeasurement.mockRejectedValueOnce(new HttpError(503, null, "catalog unavailable"));
    const { result } = mount({ stored: [SAVED] });
    const chain = result.current.tool.chains[0];
    act(() => result.current.tool.removeChain(chain.id));
    expect(api.deleteMeasurement).toHaveBeenCalledExactlyOnceWith("north", 9);
    await waitFor(() => expect(result.current.tool.chains).toEqual([chain]));
    expect(result.current.notices.map((n) => n.message)).toEqual([
      "Measurement not deleted: catalog unavailable",
    ]);
    await act(async () => result.current.notices[0].action!.run());
    expect(api.deleteMeasurement).toHaveBeenCalledTimes(2);
    expect(result.current.tool.chains).toEqual([]);
  });

  it("reads a delete that answers 404 as done", async () => {
    api.deleteMeasurement.mockRejectedValueOnce(new HttpError(404, null, "measurement not found"));
    const { result } = mount({ stored: [SAVED] });
    act(() => result.current.tool.removeChain(result.current.tool.chains[0].id));
    await waitFor(() => expect(api.deleteMeasurement).toHaveBeenCalled());
    await act(async () => {});
    expect(result.current.tool.chains).toEqual([]);
    expect(result.current.notices).toEqual([]);
  });

  // Review M6 I-2: the bundle cache must learn what was sent, or a return to
  // the page in the SPA seeds the chains as they were before.
  it("tells the page after each call that lands, and not after one that fails", async () => {
    api.updateMeasurement.mockRejectedValueOnce(new HttpError(500, null, "boom"));
    const { result } = mount({ stored: [SAVED] });
    drawAndFinish(result.current.tool);
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    act(() => result.current.tool.removeSegment(result.current.tool.chains[0].id, 0));
    await waitFor(() => expect(result.current.tool.chains[0].sync).toBe("failed"));
    expect(onChanged).toHaveBeenCalledTimes(1);
    api.deleteMeasurement.mockRejectedValueOnce(new HttpError(404, null, "gone"));
    act(() => result.current.tool.removeChain(result.current.tool.chains[1].id));
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(2));
    act(() => result.current.tool.clear(false));
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(3));
  });

  // Review M6 I-1: the chain was cut again after the failure; the old Retry
  // would push stale points and then delete the row the new cut still holds.
  it("drops a Retry whose chain has since been edited", async () => {
    api.updateMeasurement.mockRejectedValueOnce(new HttpError(500, null, "boom"));
    const { result } = mount({ stored: [SAVED] });
    act(() => result.current.tool.removeSegment(result.current.tool.chains[0].id, 0));
    await waitFor(() => expect(result.current.tool.chains[0].sync).toBe("failed"));
    const retry = result.current.notices[0].action!;
    act(() => result.current.tool.removeSegment(result.current.tool.chains[0].id, 0));
    await waitFor(() => expect(result.current.tool.chains[0].sync).toBe("saved"));
    await act(async () => retry.run());
    expect(api.updateMeasurement).toHaveBeenCalledTimes(2);
    expect(api.deleteMeasurement).not.toHaveBeenCalled();
    expect(result.current.tool.chains).toMatchObject([{ serverId: 9, sync: "saved", points: [p(2), p(3)] }]);
  });

  it("drops a Retry whose chain is gone", async () => {
    api.createMeasurement.mockRejectedValueOnce(new HttpError(500, null, "boom"));
    const { result } = mount();
    drawAndFinish(result.current.tool);
    await waitFor(() => expect(result.current.tool.chains[0].sync).toBe("failed"));
    act(() => result.current.tool.removeChain(result.current.tool.chains[0].id));
    await act(async () => result.current.notices[0].action!.run());
    expect(api.createMeasurement).toHaveBeenCalledTimes(1);
  });

  // Review M6 m-6: the reader never saw that row.
  it("only logs a refused delete of a row no chain holds", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const save = deferred<StoredChain>();
    api.createMeasurement.mockReturnValueOnce(save.promise);
    api.deleteMeasurement.mockRejectedValueOnce(new HttpError(500, null, "boom"));
    const { result } = mount();
    drawAndFinish(result.current.tool);
    act(() => result.current.tool.clear(false));
    await act(async () => save.resolve({ serverId: 41, points: [p(0), p(5)], closed: false }));
    await waitFor(() => expect(api.deleteMeasurement).toHaveBeenCalledWith("north", 41));
    await act(async () => {});
    expect(result.current.notices).toEqual([]);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it("clears the territory with one call and restores every chain when it is refused", async () => {
    api.deleteMeasurements.mockRejectedValueOnce(new HttpError(500, null, "boom"));
    const other = { ...SAVED, serverId: 10 };
    const { result } = mount({ stored: [SAVED, other] });
    act(() => result.current.tool.clear(false));
    expect(api.deleteMeasurements).toHaveBeenCalledExactlyOnceWith("north");
    await waitFor(() => expect(result.current.tool.chains.map((c) => c.serverId)).toEqual([9, 10]));
    expect(result.current.notices.map((n) => n.message)).toEqual(["Measurements not cleared: boom"]);
    // Review M6 m-1: no Retry — a repeat must ask again, and Clear is right there.
    expect(result.current.notices[0].action).toBeUndefined();
  });

  it("a reader's clear keeps the saved chains and sends nothing", () => {
    const { result } = mount({ stored: [SAVED], grants: { create: false, write: false, delete: false } });
    act(() => {
      result.current.tool.click(p(0));
      result.current.tool.click(p(5));
      result.current.tool.clear(true);
    });
    expect(result.current.tool.chains.map((c) => c.serverId)).toEqual([9]);
    expect(api.deleteMeasurements).not.toHaveBeenCalled();
  });
});

