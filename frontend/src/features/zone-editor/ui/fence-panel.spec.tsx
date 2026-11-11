import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { FencePanel } from "./fence-panel";

it("adds a keyboard-entered point", () => {
  const add = vi.fn();
  render(
    <FencePanel
      disabled={false}
      warning={null}
      start={vi.fn()}
      fence={{
        source: "a",
        page: 1,
        points: [],
        drawing: true,
        closed: false,
        error: false,
        add,
        undo: vi.fn(),
        close: vi.fn(),
        clear: vi.fn(),
        start: vi.fn(),
      }}
    />,
  );
  fireEvent.change(screen.getByLabelText("X (pt)"), { target: { value: "12" } });
  fireEvent.change(screen.getByLabelText("Y (pt)"), { target: { value: "34" } });
  fireEvent.click(screen.getByRole("button", { name: "Add point" }));
  expect(add).toHaveBeenCalledWith({ x: 12, y: 34 });
});
