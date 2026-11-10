import { render } from "@testing-library/react";
import { expect, it } from "vitest";
import { FenceOverlay } from "./fence-overlay";

it("draws an open line, then closes it and keeps vertices the same size while zooming", () => {
  const points = [
    { x: 1, y: 2 },
    { x: 4, y: 5 },
    { x: 8, y: 9 },
  ];
  const pageSize = { width: 100, height: 80 };
  const { container, rerender } = render(<FenceOverlay points={points} closed={false} pageSize={pageSize} k={1} />);
  expect(container.querySelector("polyline")).toHaveAttribute("points", "1,2 4,5 8,9");
  expect(container.querySelector("polygon")).toBeNull();
  expect(container.querySelectorAll("circle")).toHaveLength(3);
  rerender(<FenceOverlay points={points} closed pageSize={pageSize} k={2} />);
  expect(container.querySelector("polyline")).toBeNull();
  expect(container.querySelector("polygon")).toHaveAttribute("points", "1,2 4,5 8,9");
  expect(container.querySelector("circle")).toHaveAttribute("r", "2");
  rerender(<FenceOverlay points={[]} closed={false} pageSize={pageSize} k={1} />);
  expect(container.querySelector("svg")).toBeNull();
});
