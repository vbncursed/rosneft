import { describe, expect, it } from "vitest";
import { eachLimit } from "./limit";

describe("eachLimit", () => {
  it("runs every item with at most n in flight", async () => {
    let inFlight = 0;
    let peak = 0;
    const seen: number[] = [];
    await eachLimit([1, 2, 3, 4, 5], 2, async (n) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      seen.push(n);
      inFlight -= 1;
    });
    expect(seen.sort()).toEqual([1, 2, 3, 4, 5]);
    expect(peak).toBe(2);
  });
  it("rejects with the first failure", async () => {
    await expect(eachLimit([1, 2], 2, async (n) => { if (n === 2) throw new Error("boom"); })).rejects.toThrow("boom");
  });
  it("does nothing for no items", async () => {
    await expect(eachLimit([], 4, async () => {})).resolves.toBeUndefined();
  });
});
