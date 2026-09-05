import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ConfirmDialog, type ConfirmDialogProps } from "./confirm-dialog";

const props = (over: Partial<ConfirmDialogProps> = {}): ConfirmDialogProps => ({
  open: true,
  title: "Delete d.smirnov?",
  description: "This cannot be undone.",
  confirmLabel: "Delete",
  onConfirm: vi.fn(),
  onCancel: vi.fn(),
  ...over,
});

describe("ConfirmDialog", () => {
  it("renders the title and description in a dialog", () => {
    render(<ConfirmDialog {...props()} />);
    const dialog = screen.getByRole("dialog", { name: "Delete d.smirnov?" });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText("This cannot be undone.")).toBeInTheDocument();
  });

  it("names its confirm button after the action and confirms on click", async () => {
    const onConfirm = vi.fn();
    render(<ConfirmDialog {...props({ onConfirm })} />);
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("cancels without confirming", async () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render(<ConfirmDialog {...props({ onCancel, onConfirm })} />);
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("disables Cancel and marks the confirm button busy while busy", () => {
    render(<ConfirmDialog {...props({ busy: true })} />);
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    const confirm = screen.getByRole("button", { name: "Delete" });
    expect(confirm.getAttribute("aria-busy")).toBe("true");
    expect(confirm).toBeDisabled();
  });

  it("gives a danger confirmation the destructive variant", () => {
    render(<ConfirmDialog {...props({ tone: "danger" })} />);
    expect(screen.getByRole("button", { name: "Delete" }).className).toContain("border-bad");
  });
});
