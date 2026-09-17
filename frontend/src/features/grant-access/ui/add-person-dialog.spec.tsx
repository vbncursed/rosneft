import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AddPersonDialog } from "./add-person-dialog";

const OPTIONS = [
  { id: "u-1", username: "a.ivanova", hint: "Editor" },
  { id: "u-2", username: "k.petrov" },
];

describe("AddPersonDialog", () => {
  it("offers everyone not yet assigned, defaults to the first and adds by id", async () => {
    const onAdd = vi.fn();
    render(<AddPersonDialog open options={OPTIONS} onClose={vi.fn()} onAdd={onAdd} />);
    expect(screen.getByRole("dialog", { name: "Add person" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /a\.ivanova/ }));
    expect(screen.getByRole("option", { name: /k\.petrov/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("option", { name: /k\.petrov/ }));
    await userEvent.click(screen.getByRole("button", { name: "Add person" }));
    expect(onAdd).toHaveBeenCalledWith("u-2");
  });

  it("says so when everyone already has access, and disables Add while busy", () => {
    const { rerender } = render(<AddPersonDialog open options={[]} onClose={vi.fn()} onAdd={vi.fn()} />);
    expect(screen.getByText("Everyone already has access.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add person" })).not.toBeInTheDocument();
    rerender(<AddPersonDialog open options={OPTIONS} busy onClose={vi.fn()} onAdd={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Add person" })).toBeDisabled();
  });
});
