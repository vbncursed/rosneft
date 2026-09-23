import { describe, expect, it } from "vitest";
import { bulk, creating, idle, isCreating, isMutatingId, mutating, pendingIdsOf } from "./mutation-state";

describe("MutationState", () => {
  it("isCreating is true only in the creating state", () => {
    expect(isCreating(creating)).toBe(true);
    expect(isCreating(idle)).toBe(false);
    expect(isCreating(mutating(5))).toBe(false);
  });

  it("isMutatingId matches on both kind and id", () => {
    expect(isMutatingId(mutating(5), 5)).toBe(true);
    expect(isMutatingId(mutating(5), 6)).toBe(false);
    expect(isMutatingId(creating, 5)).toBe(false);
    expect(isMutatingId(idle, 5)).toBe(false);
  });

  it("isMutatingId is false during a bulk write — the form saves one placement, not many", () => {
    expect(isMutatingId(bulk([5, 6]), 5)).toBe(false);
  });

  it("pendingIdsOf names every id a write holds", () => {
    expect(pendingIdsOf(idle)).toEqual([]);
    expect(pendingIdsOf(creating)).toEqual([]);
    expect(pendingIdsOf(mutating(5))).toEqual([5]);
    expect(pendingIdsOf(bulk([5, 6]))).toEqual([5, 6]);
  });
});
