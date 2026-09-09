import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Passkey } from "@/entities/passkey";
import { RemovePasskeyModal, type RemovePasskeyModalProps } from "./remove-passkey-modal";

const PASSKEY: Passkey = {
  id: "pk-1",
  name: "MacBook Pro",
  createdAt: "2026-09-01T00:00:00Z",
  lastUsedAt: null,
};

const props = (over: Partial<RemovePasskeyModalProps> = {}): RemovePasskeyModalProps => ({
  open: true,
  passkey: PASSKEY,
  factor: "code",
  onClose: vi.fn(),
  onConfirm: vi.fn(),
  ...over,
});

describe("RemovePasskeyModal", () => {
  it("submits the typed authenticator code as { code }", async () => {
    const onConfirm = vi.fn();
    render(<RemovePasskeyModal {...props({ onConfirm })} />);

    const remove = screen.getByRole("button", { name: "Remove" });
    expect(remove).toBeDisabled();

    const digits = "123456";
    for (let i = 0; i < digits.length; i++) {
      await userEvent.type(screen.getByLabelText(`Digit ${i + 1} of 6`), digits[i]);
    }
    expect(remove).toBeEnabled();
    await userEvent.click(remove);
    expect(onConfirm).toHaveBeenCalledWith({ code: "123456" });
  });

  it("swaps the OTP grid for a recovery-code field and still submits { code }", async () => {
    const onConfirm = vi.fn();
    render(<RemovePasskeyModal {...props({ onConfirm })} />);

    await userEvent.click(screen.getByRole("button", { name: "Use a recovery code instead" }));
    expect(screen.queryByRole("group", { name: "Authenticator code" })).not.toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("Recovery code"), "abcde-12345");
    await userEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(onConfirm).toHaveBeenCalledWith({ code: "abcde-12345" });
  });

  it("submits the typed password as { password }", async () => {
    const onConfirm = vi.fn();
    render(<RemovePasskeyModal {...props({ factor: "password", onConfirm })} />);

    const remove = screen.getByRole("button", { name: "Remove" });
    expect(remove).toBeDisabled();

    await userEvent.type(screen.getByLabelText("Account password"), "hunter2!");
    expect(remove).toBeEnabled();
    await userEvent.click(remove);
    expect(onConfirm).toHaveBeenCalledWith({ password: "hunter2!" });
  });

  it("renders no submit control at all when the factor is unavailable", () => {
    render(<RemovePasskeyModal {...props({ factor: "unavailable" })} />);
    expect(screen.queryByRole("button", { name: "Remove" })).toBeNull();
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
  });
});
