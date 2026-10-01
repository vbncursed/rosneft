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
  it("starts no new item after the first failure", async () => {
    const started: number[] = [];
    await expect(
      eachLimit([1, 2, 3, 4], 2, async (n) => {
        started.push(n);
        if (n === 1) throw new Error("boom");
        await new Promise((r) => setTimeout(r, 10));
      }),
    ).rejects.toThrow("boom");
    expect(started).toEqual([1, 2]);
  });
  it("rejects only after in-flight items have settled", async () => {
    let slowDone = false;
    await expect(
      eachLimit([1, 2], 2, async (n) => {
        if (n === 1) throw new Error("boom");
        await new Promise((r) => setTimeout(r, 20));
        slowDone = true;
      }),
    ).rejects.toThrow("boom");
    expect(slowDone).toBe(true);
  });
  it("treats n below 1 as 1", async () => {
    const seen: number[] = [];
    await eachLimit([1, 2, 3], 0, async (n) => { seen.push(n); });
    expect(seen).toEqual([1, 2, 3]);
  });
});
