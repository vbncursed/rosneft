import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useSceneDrop } from "./use-scene-drop";

const SLUG = "refinery-block-c";

// Stands in for another visit's own `useQuery(sceneQuery(slug))` — all
// `dropOrOweScene` sees is an observer count, not who holds it.
const read = (client: QueryClient) =>
  new QueryObserver(client, { queryKey: ["scene", SLUG], queryFn: () => ({}), enabled: false }).subscribe(() => {});

describe("useSceneDrop", () => {
  it("invalidates the scene, territory and catalog queries without refetching", () => {
    const client = new QueryClient();
    client.setQueryData(["scene", SLUG], {});
    const spy = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useSceneDrop(client, SLUG));

    act(() => result.current());

    for (const queryKey of [["scene", SLUG], ["territory", SLUG], ["territories"], ["model"], ["models"]]) {
      expect(spy).toHaveBeenCalledWith({ queryKey, refetchType: "none" });
    }
  });

  it("keeps the cached bundle on unmount when nothing changed", () => {
    const client = new QueryClient();
    client.setQueryData(["scene", SLUG], {});
    const { unmount } = renderHook(() => useSceneDrop(client, SLUG));

    unmount();

    expect(client.getQueryData(["scene", SLUG])).toEqual({});
  });

  it("drops the cached bundle on unmount once it changed", () => {
    const client = new QueryClient();
    client.setQueryData(["scene", SLUG], {});
    const { result, unmount } = renderHook(() => useSceneDrop(client, SLUG));

    act(() => result.current());
    unmount();

    expect(client.getQueryData(["scene", SLUG])).toBeUndefined();
  });

  it("drops the cached bundle when a change lands after unmount and nobody is reading it", () => {
    const client = new QueryClient();
    client.setQueryData(["scene", SLUG], {});
    const { result, unmount } = renderHook(() => useSceneDrop(client, SLUG));

    unmount();
    act(() => result.current());

    expect(client.getQueryData(["scene", SLUG])).toBeUndefined();
  });

  it("marks the bundle stale, not dropped, when a change lands while a new visit is reading it", () => {
    const client = new QueryClient();
    client.setQueryData(["scene", SLUG], {});
    const { result, unmount } = renderHook(() => useSceneDrop(client, SLUG));
    unmount();

    const stop = read(client);
    act(() => result.current());

    expect(client.getQueryData(["scene", SLUG])).toEqual({});
    expect(client.getQueryState(["scene", SLUG])?.isInvalidated).toBe(true);
    stop();
  });

  // A rename writes the scene with setQueryData, which clears TanStack's own
  // `isInvalidated` flag — the drop on unmount has to come off the `changed`
  // ref, not off that flag, or a rename after a change silently keeps a
  // bundle that should have dropped.
  it("drops the cached bundle on unmount even when a rename rewrote it after the change", () => {
    const client = new QueryClient();
    client.setQueryData(["scene", SLUG], {});
    const { result, unmount } = renderHook(() => useSceneDrop(client, SLUG));

    act(() => result.current());
    act(() => client.setQueryData(["scene", SLUG], { renamed: true }));
    expect(client.getQueryState(["scene", SLUG])?.isInvalidated).toBe(false);

    unmount();

    expect(client.getQueryData(["scene", SLUG])).toBeUndefined();
  });

  it("drops a bundle a late change marked, once the visit that kept it leaves", () => {
    const client = new QueryClient();
    client.setQueryData(["scene", SLUG], {});
    const first = renderHook(() => useSceneDrop(client, SLUG));
    first.unmount();

    const stop = read(client);
    const second = renderHook(() => useSceneDrop(client, SLUG));
    act(() => first.result.current());
    expect(client.getQueryData(["scene", SLUG])).toEqual({});

    stop();
    second.unmount();

    expect(client.getQueryData(["scene", SLUG])).toBeUndefined();
  });
});
