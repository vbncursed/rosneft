import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { DrawingOverlay } from "./drawing-overlay";

it("shows the rectangle between the drag endpoints in page coordinates", () => {
  const { container } = render(
    <DrawingOverlay start={{ x: 30, y: 40 }} end={{ x: 10, y: 20 }} pageSize={{ width: 200, height: 100 }} />,
  );
  expect(screen.getByTestId("manual-drawing")).toHaveAttribute("points", "30,40 10,40 10,20 30,20");
  expect(container.querySelector("svg")).toHaveAttribute("viewBox", "0 0 200 100");
});
