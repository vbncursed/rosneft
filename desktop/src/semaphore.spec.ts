import { describe, expect, it } from "vitest";
import { Semaphore } from "./semaphore";

describe("Semaphore", () => {
  it("hands a released slot to the oldest waiter", async () => {
    const s = new Semaphore(1);
    const order: number[] = [];
    await s.acquire(new AbortController().signal);
    const a = s.acquire(new AbortController().signal).then(() => order.push(1));
    const b = s.acquire(new AbortController().signal).then(() => order.push(2));
    s.release();
    await a;
    expect(order).toEqual([1]);
    s.release();
    await b;
    expect(order).toEqual([1, 2]);
  });

  it("an aborted waiter rejects and takes no slot", async () => {
    const s = new Semaphore(1);
    await s.acquire(new AbortController().signal);
    const ctl = new AbortController();
    const waiting = s.acquire(ctl.signal);
    ctl.abort(new Error("stop"));
    await expect(waiting).rejects.toThrow("stop");
    s.release();
    await expect(s.acquire(new AbortController().signal)).resolves.toBeUndefined();
  });

  it("rejects at once on an already aborted signal", async () => {
    const ctl = new AbortController();
    ctl.abort(new Error("done"));
    await expect(new Semaphore(1).acquire(ctl.signal)).rejects.toThrow("done");
  });
});
