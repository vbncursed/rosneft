import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ZoomControls } from "./zoom-controls";

it("zooms in and out by reciprocal factors and fits the page", () => {
  const zoom = vi.fn();
  const fit = vi.fn();
  render(<ZoomControls zoom={zoom} fit={fit} />);
  fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
  fireEvent.click(screen.getByRole("button", { name: "Zoom out" }));
  fireEvent.click(screen.getByRole("button", { name: "Fit the page" }));
  expect(zoom.mock.calls.map(([factor]) => factor)).toEqual([1.25, 0.8]);
  expect(fit).toHaveBeenCalledOnce();
});
