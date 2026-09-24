import { act, render, screen } from "@testing-library/react";
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
    const save = screen.getByRole("button", { name: "Save group title" });
    expect(save).toBeDisabled();
    // E9: saving reads as busy (a spinner, undimmed), not as "cannot save".
    expect(save).toHaveAttribute("aria-busy", "true");
    expect(screen.getByTestId("button-spinner")).toBeInTheDocument();
    expect(save).not.toHaveClass("opacity-55");
  });

  it("dims the check only when there is no title to save", () => {
    render(<GroupTitleField label="t" submitLabel="Save group title" busy={false} onSubmit={vi.fn()} onCancel={vi.fn()} />);
    const save = screen.getByRole("button", { name: "Save group title" });
    expect(save).toBeDisabled();
    expect(save).not.toHaveAttribute("aria-busy");
    expect(save).toHaveClass("opacity-55");
  });
});

describe("NewGroup", () => {
  it("opens the inline field, creates, and folds back to the button once the group exists", async () => {
    let release!: (ok: boolean) => void;
    const onCreate = vi.fn(() => new Promise<boolean>((res) => (release = res)));
    const { rerender } = render(<NewGroup busy={false} onCreate={onCreate} />);
    await userEvent.click(screen.getByRole("button", { name: "New group" }));
    await userEvent.type(screen.getByRole("textbox", { name: "New group title" }), "West yard{Enter}");
    expect(onCreate).toHaveBeenCalledWith("West yard");
    rerender(<NewGroup busy onCreate={onCreate} />);
    expect(screen.getByRole("textbox", { name: "New group title" })).toHaveValue("West yard");
    expect(screen.getByRole("button", { name: "Create group" })).toBeDisabled();
    await act(async () => release(true));
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByRole("button", { name: "New group" })).toHaveFocus();
  });

  // E14: the field takes the button's 30 px, so nothing below it jumps.
  it("opens a field as tall as the button it replaces", async () => {
    render(<NewGroup busy={false} onCreate={vi.fn(async () => true)} />);
    expect(screen.getByRole("button", { name: "New group" })).toHaveClass("py-1.5");
    await userEvent.click(screen.getByRole("button", { name: "New group" }));
    const field = screen.getByRole("textbox", { name: "New group title" });
    expect(field).toHaveClass("py-1");
    expect(field).not.toHaveClass("py-2.5");
  });

  // The toast says why (a duplicate title, say); the typed title stays to be fixed.
  it("keeps the field and its text when the create is refused", async () => {
    const onCreate = vi.fn(async () => false);
    render(<NewGroup busy={false} onCreate={onCreate} />);
    await userEvent.click(screen.getByRole("button", { name: "New group" }));
    await userEvent.type(screen.getByRole("textbox", { name: "New group title" }), "East yard{Enter}");
    expect(onCreate).toHaveBeenCalledWith("East yard");
    expect(screen.getByRole("textbox", { name: "New group title" })).toHaveValue("East yard");
  });

  // P1: a create answered after Cancel and a reopen belongs to the old field.
  it("keeps a reopened field open when the earlier create lands late", async () => {
    let release!: (ok: boolean) => void;
    const onCreate = vi.fn(() => new Promise<boolean>((res) => (release = res)));
    render(<NewGroup busy={false} onCreate={onCreate} />);
    await userEvent.click(screen.getByRole("button", { name: "New group" }));
    await userEvent.type(screen.getByRole("textbox", { name: "New group title" }), "West yard{Enter}");
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await userEvent.click(screen.getByRole("button", { name: "New group" }));
    await userEvent.type(screen.getByRole("textbox", { name: "New group title" }), "North");
    await act(async () => release(true));
    expect(screen.getByRole("textbox", { name: "New group title" })).toHaveValue("North");
  });

  it("folds back without creating on Cancel", async () => {
    const onCreate = vi.fn();
    render(<NewGroup busy={false} onCreate={onCreate} />);
    await userEvent.click(screen.getByRole("button", { name: "New group" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCreate).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByRole("button", { name: "New group" })).toHaveFocus();
  });
});
