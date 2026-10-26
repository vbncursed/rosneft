import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const markTourSeen = vi.fn();
vi.mock("@/features/onboarding/api/tours-gateway", () => ({
  markTourSeen: (id: string) => markTourSeen(id),
}));

// useTour remembers finished tours at module level, so each test gets a fresh copy.
async function setup(seen: string[] | undefined, ready: boolean) {
  vi.resetModules();
  const { useTagsTour } = await import("./use-tags-tour");
  return renderHook(() => useTagsTour({ seen, ready }));
}

beforeEach(() => markTourSeen.mockReset().mockResolvedValue(undefined));

describe("useTagsTour", () => {
  it("starts on the Tags card the first time a tag manager sees the page", async () => {
    const { result } = await setup([], true);
    expect(result.current.active).toBe(true);
    expect(result.current.step?.id).toBe("content-tags");
  });

  it("waits for the page to be ready, and for the principal", async () => {
    expect((await setup([], false)).result.current.active).toBe(false);
    expect((await setup(undefined, true)).result.current.active).toBe(false);
  });

  it("stays quiet for a reader who has seen it", async () => {
    expect((await setup(["content-tags"], true)).result.current.active).toBe(false);
  });

  it("POSTs its own id once when it ends, and replays", async () => {
    const { result } = await setup([], true);
    act(() => result.current.next());
    act(() => result.current.next());
    expect(result.current.active).toBe(false);
    expect(markTourSeen).toHaveBeenCalledTimes(1);
    expect(markTourSeen).toHaveBeenCalledWith("content-tags");
    act(() => result.current.restart());
    expect(result.current.step?.id).toBe("content-tags");
  });
});
