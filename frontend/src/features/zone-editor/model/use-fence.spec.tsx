import { act, renderHook } from "@testing-library/react";
import { expect, it } from "vitest";
import { useFence } from "./use-fence";

it("keeps a closed boundary only for its source and page", () => {
  const { result, rerender } = renderHook(({ source, page }) => useFence(source, page), {
    initialProps: { source: "a", page: 1 },
  });
  act(() => result.current.start());
  act(() => {
    result.current.add({ x: 0, y: 0 });
    result.current.add({ x: 10, y: 0 });
    result.current.add({ x: 0, y: 10 });
  });
  act(() => result.current.close());
  expect(result.current.closed).toBe(true);
  rerender({ source: "a", page: 2 });
  expect(result.current.points).toEqual([]);
  rerender({ source: "b", page: 1 });
  expect(result.current.points).toEqual([]);
});
