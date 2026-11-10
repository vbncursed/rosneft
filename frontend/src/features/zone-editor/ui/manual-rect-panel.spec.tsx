import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { ManualRectPanel } from "./manual-rect-panel";

it("enables drawing and edits dimensions in page points", () => {
  const onDraw = vi.fn(),
    onEdit = vi.fn();
  render(
    <ManualRectPanel
      drawing={false}
      disabled={false}
      manual={{ x: 10, y: 20, width: 30, height: 40, angle: 0 }}
      onDraw={onDraw}
      onEdit={onEdit}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Draw rectangle" }));
  expect(onDraw).toHaveBeenCalledWith(true);
  fireEvent.change(screen.getByLabelText("Width (pt)"), { target: { value: "45" } });
  expect(onEdit).toHaveBeenCalledWith({ x: 10, y: 20, width: 45, height: 40, angle: 0 });
});

it("edits drawing dimensions in metres while preserving page points", () => {
  const onEdit = vi.fn();
  render(
    <ManualRectPanel
      drawing={false}
      disabled={false}
      metresPerPt={0.1}
      manual={{ x: 10, y: 20, width: 30, height: 40, angle: 0 }}
      onDraw={vi.fn()}
      onEdit={onEdit}
    />,
  );
  expect(screen.getByLabelText("Drawing width (m)")).toHaveValue(3);
  fireEvent.change(screen.getByLabelText("Drawing width (m)"), { target: { value: "5" } });
  expect(onEdit).toHaveBeenCalledWith({ x: 10, y: 20, width: 50, height: 40, angle: 0 });
  expect(screen.getByText(/drawing dimensions.*model/i)).toBeInTheDocument();
});

it("offers keyboard creation of an initial draft", async () => {
  const onCreate = vi.fn();
  render(
    <ManualRectPanel
      drawing={false}
      disabled={false}
      manual={null}
      onDraw={vi.fn()}
      onEdit={vi.fn()}
      onCreate={onCreate}
    />,
  );
  screen.getByRole("button", { name: "Create rectangle with fields" }).focus();
  await userEvent.keyboard("{Enter}");
  expect(onCreate).toHaveBeenCalledOnce();
});
