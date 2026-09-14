import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DisableTwoFactorModal } from "./disable-two-factor-modal";

const props = (over: Partial<Parameters<typeof DisableTwoFactorModal>[0]> = {}) => ({
  open: true,
  busy: false,
  onClose: vi.fn(),
  onConfirm: vi.fn(),
  ...over,
});

describe("DisableTwoFactorModal", () => {
  it("names the danger and rules out a recovery code, which the server rejects here", () => {
    render(<DisableTwoFactorModal {...props()} />);
    expect(screen.getByRole("heading", { name: "Turn two-factor off?" })).toBeInTheDocument();
    expect(screen.getByText("Disable two-factor · danger")).toBeInTheDocument();
    expect(screen.getByText(/A recovery code is not accepted here\./)).toBeInTheDocument();
  });

  it("submits the six digits and nothing else", async () => {
    const onConfirm = vi.fn();
    render(<DisableTwoFactorModal {...props({ onConfirm })} />);
    await userEvent.type(screen.getByRole("textbox", { name: /digit 1/i }), "123456");
    await userEvent.click(screen.getByRole("button", { name: "Disable" }));
    expect(onConfirm).toHaveBeenCalledExactlyOnceWith("123456");
  });

  it("will not submit a partial code", async () => {
    render(<DisableTwoFactorModal {...props()} />);
    expect(screen.getByRole("button", { name: "Disable" })).toBeDisabled();
    await userEvent.type(screen.getByRole("textbox", { name: /digit 1/i }), "12345");
    expect(screen.getByRole("button", { name: "Disable" })).toBeDisabled();
  });

  it("blocks a second submit while the first is in flight", async () => {
    render(<DisableTwoFactorModal {...props({ busy: true })} />);
    await userEvent.type(screen.getByRole("textbox", { name: /digit 1/i }), "123456");
    expect(screen.getByRole("button", { name: "Disable" })).toBeDisabled();
  });

  it("closes without submitting", async () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn();
    render(<DisableTwoFactorModal {...props({ onClose, onConfirm })} />);
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("renders nothing while closed", () => {
    render(<DisableTwoFactorModal {...props({ open: false })} />);
    expect(screen.queryByRole("heading", { name: "Turn two-factor off?" })).not.toBeInTheDocument();
  });
});
