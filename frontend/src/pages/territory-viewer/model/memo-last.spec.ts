import { describe, expect, it, vi } from "vitest";
import { memoLast } from "./memo-last";

describe("memoLast", () => {
  it("answers the same object while every argument is the same reference", () => {
    const fn = vi.fn((a: object, n: number) => ({ a, n }));
    const memo = memoLast(fn);
    const a = {};
    expect(memo(a, 1)).toBe(memo(a, 1));
    expect(fn).toHaveBeenCalledOnce();
  });

  it("recomputes on a new identity, even with equal content, and remembers only the last", () => {
    const fn = vi.fn((a: object) => ({ a }));
    const memo = memoLast(fn);
    const a = {};
    const first = memo(a);
    expect(memo({ ...a })).not.toBe(first);
    memo({});
    expect(memo(a)).not.toBe(first);
    expect(fn).toHaveBeenCalledTimes(4);
  });
});
