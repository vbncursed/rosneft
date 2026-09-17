import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TwoFactorForm, type TwoFactorFormProps } from "./two-factor-form";

const props = (over: Partial<TwoFactorFormProps> = {}): TwoFactorFormProps => ({
  account: { username: "a.ivanova", email: "a.ivanova@example.com" },
  onChangeAccount: vi.fn(),
  code: "",
  onCodeChange: vi.fn(),
  onSubmit: vi.fn(),
  onUseRecoveryCode: vi.fn(),
  onBack: vi.fn(),
  ...over,
});

describe("TwoFactorForm", () => {
  it("names who is signing in, so a shared machine cannot mislead", () => {
    render(<TwoFactorForm {...props()} />);
    expect(screen.getByText("a.ivanova")).toBeInTheDocument();
    expect(screen.getByText("a.ivanova@example.com")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "a.ivanova" })).toBeInTheDocument();
  });

  it("offers six labelled cells", () => {
    render(<TwoFactorForm {...props()} />);
    expect(screen.getByRole("group", { name: "Authenticator code" })).toBeInTheDocument();
    expect(screen.getAllByRole("textbox")).toHaveLength(6);
  });

  it("reports the code as it is typed", async () => {
    const onCodeChange = vi.fn();
    render(<TwoFactorForm {...props({ onCodeChange })} />);
    await userEvent.type(screen.getByLabelText("Digit 1 of 6"), "4");
    expect(onCodeChange).toHaveBeenCalledWith("4");
  });

  it("waits for all six digits — a short code is a typo, not a decision", () => {
    const { rerender } = render(<TwoFactorForm {...props({ code: "402" })} />);
    expect(screen.getByRole("button", { name: /Verify/ })).toBeDisabled();

    rerender(<TwoFactorForm {...props({ code: "402917" })} />);
    expect(screen.getByRole("button", { name: /Verify/ })).toBeEnabled();
  });

  it("submits the completed code", async () => {
    const onSubmit = vi.fn();
    render(<TwoFactorForm {...props({ code: "402917", onSubmit })} />);
    await userEvent.click(screen.getByRole("button", { name: /Verify/ }));
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it("counts the code down only when it expires on a clock", () => {
    const { rerender } = render(<TwoFactorForm {...props()} />);
    expect(screen.queryByText(/code expires/)).not.toBeInTheDocument();

    rerender(<TwoFactorForm {...props({ expiresIn: "0:24" })} />);
    expect(screen.getByText("code expires in 0:24")).toBeInTheDocument();
  });

  it("offers the two ways out: another account, or a recovery code", async () => {
    const p = props();
    render(<TwoFactorForm {...p} />);

    await userEvent.click(screen.getByRole("button", { name: "change" }));
    await userEvent.click(screen.getByRole("button", { name: "use recovery code" }));
    await userEvent.click(screen.getByRole("button", { name: "← Back" }));
    expect(p.onChangeAccount).toHaveBeenCalledOnce();
    expect(p.onUseRecoveryCode).toHaveBeenCalledOnce();
    expect(p.onBack).toHaveBeenCalledOnce();
  });

  it("freezes the cells while the code is being checked", () => {
    render(<TwoFactorForm {...props({ code: "402917", submitting: true })} />);
    expect(screen.getByLabelText("Digit 1 of 6")).toBeDisabled();
    expect(screen.getByRole("button", { name: /Verify/ })).toBeDisabled();
  });
});
