import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createPlacementGroup,
  deletePlacementGroup,
  renamePlacementGroup,
} from "@/entities/placement";
import { HttpError } from "@/shared/api";
import { clearNotices, useNotices } from "@/shared/lib/notify";
import { usePlacementGroups } from "./use-placement-groups";

vi.mock("@/entities/placement", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  createPlacementGroup: vi.fn(),
  renamePlacementGroup: vi.fn(),
  deletePlacementGroup: vi.fn(),
}));

let onChanged: ReturnType<typeof vi.fn<() => void>>;
let onRemoved: ReturnType<typeof vi.fn<(id: number) => void>>;
const mount = () =>
  renderHook(() => ({
    s: usePlacementGroups({ slug: "t", initial: [{ id: 1, title: "East yard" }], onChanged, onRemoved }),
    notices: useNotices(),
  }));

beforeEach(() => {
  vi.mocked(createPlacementGroup).mockReset();
  vi.mocked(renamePlacementGroup).mockReset();
  vi.mocked(deletePlacementGroup).mockReset();
  onChanged = vi.fn();
  onRemoved = vi.fn();
  clearNotices();
});

describe("usePlacementGroups", () => {
  it("seeds from the bundle's groups", () => {
    expect(mount().result.current.s.list).toEqual([{ id: 1, title: "East yard" }]);
  });

  it("adds a created group as the server answered it, busy meanwhile", async () => {
    let release!: () => void;
    vi.mocked(createPlacementGroup).mockReturnValueOnce(
      new Promise((res) => (release = () => res({ id: 2, title: "West yard" }))),
    );
    const { result } = mount();
    let done!: Promise<void>;
    act(() => {
      done = result.current.s.create("West yard");
    });
    expect(result.current.s.busy).toBe(true);
    await act(async () => {
      release();
      await done;
    });
    expect(createPlacementGroup).toHaveBeenCalledWith("t", "West yard");
    expect(result.current.s.list.map((g) => g.title)).toEqual(["East yard", "West yard"]);
    expect(result.current.s.busy).toBe(false);
    expect(onChanged).toHaveBeenCalledOnce();
  });

  it("renames in place", async () => {
    vi.mocked(renamePlacementGroup).mockResolvedValue({ id: 1, title: "North yard" });
    const { result } = mount();
    await act(() => result.current.s.rename(1, "North yard"));
    expect(renamePlacementGroup).toHaveBeenCalledWith("t", 1, "North yard");
    expect(result.current.s.list).toEqual([{ id: 1, title: "North yard" }]);
  });

  // G-4: deleting a group never deletes placements; they return to No group.
  it("drops a deleted group and hands its id on, so the editor ungroups its placements", async () => {
    vi.mocked(deletePlacementGroup).mockResolvedValue(undefined);
    const { result } = mount();
    await act(() => result.current.s.remove(1));
    expect(result.current.s.list).toEqual([]);
    expect(onRemoved).toHaveBeenCalledWith(1);
  });

  it("keeps the list on a refusal, says why, and still marks the scene stale", async () => {
    vi.mocked(deletePlacementGroup).mockRejectedValue(new HttpError(403, null, "You don't have permission to do this"));
    const { result } = mount();
    await act(() => result.current.s.remove(1));
    expect(result.current.s.list).toHaveLength(1);
    expect(onRemoved).not.toHaveBeenCalled();
    expect(result.current.notices[0]?.message).toBe("You don't have permission to do this");
    expect(onChanged).toHaveBeenCalledOnce();
    expect(result.current.s.busy).toBe(false);
  });
});
