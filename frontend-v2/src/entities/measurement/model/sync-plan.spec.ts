import { describe, expect, it } from "vitest";
import {
  initialMeasurementState,
  measurementReducer as reduce,
  type MeasurementAction,
  type MeasurementState,
} from "./measurement-reducer";
import { canEditSaved, syncPlan, type SyncGrants } from "./sync-plan";

const p = (x: number) => ({ x, y: 0, z: 0 });
const ALL: SyncGrants = { create: true, write: true, delete: true };
const NONE: SyncGrants = { create: false, write: false, delete: false };

const clicks = (...xs: number[]): MeasurementState =>
  xs.reduce<MeasurementState>((s, x) => reduce(s, { type: "click", point: p(x) }), {
    ...initialMeasurementState,
    measureMode: true,
  });
// One stored chain (local id 1, server id 7), nothing active.
const stored = (xs: number[], closed = false): MeasurementState =>
  reduce(initialMeasurementState, {
    type: "seed",
    chains: [{ serverId: 7, points: xs.map(p), closed }],
  });
const finished = (...xs: number[]) => reduce(clicks(...xs), { type: "cancelChain" });

function plan(before: MeasurementState, action: MeasurementAction, grants = ALL) {
  return syncPlan(action, before, reduce(before, action), grants);
}

const cut = (segmentIndex: number): MeasurementAction => ({
  type: "removeSegment",
  chainId: 1,
  segmentIndex,
});

describe("syncPlan — finishing a chain", () => {
  const two = [p(0), p(1)];
  it.each([
    ["closeActive", { type: "closeActive" }],
    ["cancelChain", { type: "cancelChain" }],
    ["exit", { type: "exit" }],
    ["toggle off", { type: "toggle" }],
  ] as const)("%s creates a finished two-point chain", (_, action) => {
    expect(plan(clicks(0, 1), action)).toEqual([
      { kind: "create", id: 1, points: two, closed: false },
    ]);
  });

  it("a click that closes the loop creates a closed chain", () => {
    expect(plan(clicks(0, 1, 2), { type: "click", point: p(0) })).toEqual([
      { kind: "create", id: 1, points: [p(0), p(1), p(2)], closed: true },
    ]);
  });

  it("a one-point chain is never created, even if a state still holds it", () => {
    const before = clicks(0);
    const after = { ...before, activeChainId: null };
    expect(syncPlan({ type: "exit" }, before, after, ALL)).toEqual([]);
  });

  it.each([
    ["a one-point chain is dropped, not created", clicks(0), { type: "exit" }, ALL],
    ["a reader without create keeps it local", clicks(0, 1), { type: "exit" }, NONE],
    ["a click that extends the chain sends nothing", clicks(0, 1), { type: "click", point: p(5) }, ALL],
    ["removing the active chain sends nothing", clicks(0, 1), { type: "removeChain", chainId: 1 }, ALL],
    ["a click that starts a chain sends nothing", finished(0, 1), { type: "click", point: p(5) }, ALL],
    ["leaving with nothing active sends nothing", finished(0, 1), { type: "exit" }, ALL],
  ] as const)("%s", (_, before, action, grants) => {
    expect(plan(before, action, grants)).toEqual([]);
  });
});

describe("syncPlan — removing and cutting", () => {
  it("removing a saved chain deletes it", () => {
    const before = stored([0, 1]);
    expect(plan(before, { type: "removeChain", chainId: 1 })).toEqual([
      { kind: "delete", id: 1, serverId: 7, chain: before.chains[0] },
    ]);
  });

  it("a cut in the middle of a saved chain updates the left part and creates the right", () => {
    const before = stored([0, 1, 2, 3]);
    const after = reduce(before, cut(1));
    expect(syncPlan(cut(1), before, after, ALL)).toEqual([
      { kind: "update", id: after.chains[0].id, serverId: 7, points: [p(0), p(1)], closed: false },
      { kind: "create", id: after.chains[1].id, points: [p(2), p(3)], closed: false },
    ]);
  });

  it("cutting the first segment of a saved two-point chain deletes it", () => {
    const before = stored([0, 1]);
    expect(plan(before, cut(0))).toEqual([
      { kind: "delete", id: 1, serverId: 7, chain: before.chains[0] },
    ]);
  });

  it.each([
    ["first", 0, [p(1), p(2)]],
    ["last", 1, [p(0), p(1)]],
  ] as const)("cutting the %s segment of a saved three-point chain is one update", (_, index, points) => {
    expect(plan(stored([0, 1, 2]), cut(index))).toEqual([
      { kind: "update", id: expect.any(Number), serverId: 7, points, closed: false },
    ]);
  });

  it("a cut that keeps one part needs only the write grant", () => {
    const ops = plan(stored([0, 1, 2]), cut(0), { create: false, write: true, delete: false });
    expect(ops.map((op) => op.kind)).toEqual(["update"]);
  });

  it("opening a saved closed chain is one update", () => {
    const ops = plan(stored([0, 1, 2], true), cut(2));
    expect(ops).toEqual([
      { kind: "update", id: expect.any(Number), serverId: 7, points: [p(0), p(1), p(2)], closed: false },
    ]);
  });

  it("cutting the active chain finishes both parts, and both are created", () => {
    const ops = plan(clicks(0, 1, 2, 3), cut(1));
    expect(ops.map((op) => [op.kind, "points" in op && op.points])).toEqual([
      ["create", [p(0), p(1)]],
      ["create", [p(2), p(3)]],
    ]);
  });

  it.each([
    ["removing a local chain", finished(0, 1), { type: "removeChain", chainId: 1 }, ALL],
    ["cutting a finished local chain", finished(0, 1, 2, 3), cut(1), ALL],
    ["a cut that changes nothing", stored([0, 1]), cut(5), ALL],
    ["a reader removing a saved chain", stored([0, 1]), { type: "removeChain", chainId: 1 }, NONE],
    ["a reader cutting a saved chain", stored([0, 1, 2, 3]), cut(1), NONE],
  ] as const)("%s sends nothing", (_, before, action, grants) => {
    expect(plan(before, action, grants)).toEqual([]);
  });

  it("each operation needs its own grant", () => {
    const ops = plan(stored([0, 1, 2, 3]), cut(1), { create: false, write: true, delete: true });
    expect(ops.map((op) => op.kind)).toEqual(["update"]);
  });
});

describe("syncPlan — clear and bookkeeping", () => {
  it("clear with saved chains deletes all of them in one call, carrying them for a revert", () => {
    const before = reduce(finished(5, 6), {
      type: "seed",
      chains: [{ serverId: 7, points: [p(0), p(1)], closed: false }],
    });
    expect(plan(before, { type: "clear", keepSaved: false })).toEqual([
      { kind: "deleteAll", chains: [before.chains[1]] },
    ]);
  });

  it("a save that lands for a chain already gone deletes the orphaned row", () => {
    const before = finished(0, 1);
    const saved = { type: "saved", id: 99, serverId: 5 } as const;
    expect(plan(before, saved)).toEqual([{ kind: "delete", id: 99, serverId: 5, chain: null }]);
    expect(plan(before, saved, NONE)).toEqual([]);
  });

  it("a chain removed while its create is in flight is deleted once the save lands", () => {
    const saving = reduce(finished(0, 1), { type: "saving", id: 1 });
    const removed = reduce(saving, { type: "removeChain", chainId: 1 });
    expect(plan(saving, { type: "removeChain", chainId: 1 })).toEqual([]);
    expect(plan(removed, { type: "saved", id: 1, serverId: 5 })).toEqual([
      { kind: "delete", id: 1, serverId: 5, chain: null },
    ]);
  });

  it.each([
    ["clear with no saved chains", finished(0, 1), { type: "clear", keepSaved: false }, ALL],
    ["clear that keeps saved chains", stored([0, 1]), { type: "clear", keepSaved: true }, ALL],
    ["clear by a reader", stored([0, 1]), { type: "clear", keepSaved: false }, NONE],
    ["seed", finished(0, 1), { type: "seed", chains: [] }, ALL],
    ["saving", finished(0, 1), { type: "saving", id: 1 }, ALL],
    ["saved", finished(0, 1), { type: "saved", id: 1, serverId: 3 }, ALL],
    ["failed", finished(0, 1), { type: "failed", id: 1 }, ALL],
  ] as [string, MeasurementState, MeasurementAction, SyncGrants][])("%s sends nothing", (_, before, action, grants) => {
    expect(plan(before, action, grants)).toEqual([]);
  });

  it("seed and restore send nothing even when the chains changed under them", () => {
    const before = stored([0, 1]);
    const gone = reduce(before, { type: "removeChain", chainId: 1 });
    expect(syncPlan({ type: "seed", chains: [] }, before, gone, ALL)).toEqual([]);
    const action = { type: "restore", chain: before.chains[0] } as const;
    expect(syncPlan(action, gone, reduce(gone, action), ALL)).toEqual([]);
  });
});

describe("canEditSaved", () => {
  it.each([
    [ALL, true],
    [NONE, false],
    [{ create: false, write: true, delete: true }, false],
    [{ create: true, write: false, delete: true }, false],
    [{ create: true, write: true, delete: false }, false],
  ])("%o → %s", (grants, expected) => {
    expect(canEditSaved(grants)).toBe(expected);
  });
});
