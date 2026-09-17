import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AddRoleDialog, type AddRoleDialogProps } from "./add-role-dialog";

const OPTIONS = [
  { slug: "field-operator", title: "field-operator" },
  { slug: "guest", title: "guest" },
];

const props = (over: Partial<AddRoleDialogProps> = {}): AddRoleDialogProps => ({
  open: true,
  options: OPTIONS,
  onClose: vi.fn(),
  onAdd: vi.fn(),
  ...over,
});

describe("AddRoleDialog", () => {
  it("offers every option not yet granted and defaults to the first", async () => {
    render(<AddRoleDialog {...props()} />);
    const trigger = screen.getByRole("button", { name: /field-operator/ });
    expect(trigger).toBeInTheDocument();

    await userEvent.click(trigger);
    expect(screen.getByRole("option", { name: "field-operator" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "guest" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "field-operator" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("adds the picked role", async () => {
    const onAdd = vi.fn();
    render(<AddRoleDialog {...props({ onAdd })} />);
    await userEvent.click(screen.getByRole("button", { name: "Add role" }));
    expect(onAdd).toHaveBeenCalledWith("field-operator");
  });

  it("adds a different role once one is picked from the dropdown", async () => {
    const onAdd = vi.fn();
    render(<AddRoleDialog {...props({ onAdd })} />);
    await userEvent.click(screen.getByRole("button", { name: /field-operator/ }));
    await userEvent.click(screen.getByRole("option", { name: "guest" }));
    await userEvent.click(screen.getByRole("button", { name: "Add role" }));
    expect(onAdd).toHaveBeenCalledWith("guest");
  });

  it("says every role is already granted and hides Add when there is nothing left", () => {
    render(<AddRoleDialog {...props({ options: [] })} />);
    expect(screen.getByText("Every role is already granted.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add role" })).not.toBeInTheDocument();
  });

  it("disables Add role while busy", () => {
    render(<AddRoleDialog {...props({ busy: true })} />);
    expect(screen.getByRole("button", { name: "Add role" })).toBeDisabled();
  });
});
