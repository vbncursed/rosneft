import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { GroupTitleField, NewGroup } from "./group-title-field";

describe("GroupTitleField", () => {
  it("submits the trimmed title on Enter", async () => {
    const onSubmit = vi.fn();
    render(<GroupTitleField label="New group title" submitLabel="Create group" busy={false} onSubmit={onSubmit} onCancel={vi.fn()} />);
    const field = screen.getByRole("textbox", { name: "New group title" });
    expect(field).toHaveFocus();
    await userEvent.type(field, "  East yard  {Enter}");
    expect(onSubmit).toHaveBeenCalledWith("East yard");
  });

  it("will not submit a blank title, and stops typing at the gateway's bound", () => {
    render(<GroupTitleField label="New group title" submitLabel="Create group" busy={false} onSubmit={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Create group" })).toBeDisabled();
    expect(screen.getByRole("textbox", { name: "New group title" })).toHaveAttribute("maxlength", "120");
  });

  it("cancels on Escape and on its own button", async () => {
    const onCancel = vi.fn();
    render(<GroupTitleField label="Rename group East yard" submitLabel="Save group title" initial="East yard" busy={false} onSubmit={vi.fn()} onCancel={onCancel} />);
    await userEvent.type(screen.getByRole("textbox", { name: "Rename group East yard" }), "{Escape}");
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it("waits while a group write is in flight", async () => {
    render(<GroupTitleField label="t" submitLabel="Save group title" initial="East yard" busy onSubmit={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Save group title" })).toBeDisabled();
  });
});

describe("NewGroup", () => {
  it("opens the inline field, creates, and folds back to the button", async () => {
    const onCreate = vi.fn();
    render(<NewGroup busy={false} onCreate={onCreate} />);
    await userEvent.click(screen.getByRole("button", { name: "New group" }));
    await userEvent.type(screen.getByRole("textbox", { name: "New group title" }), "West yard{Enter}");
    expect(onCreate).toHaveBeenCalledWith("West yard");
    expect(screen.getByRole("button", { name: "New group" })).toBeInTheDocument();
  });

  it("folds back without creating on Cancel", async () => {
    const onCreate = vi.fn();
    render(<NewGroup busy={false} onCreate={onCreate} />);
    await userEvent.click(screen.getByRole("button", { name: "New group" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCreate).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox")).toBeNull();
  });
});
