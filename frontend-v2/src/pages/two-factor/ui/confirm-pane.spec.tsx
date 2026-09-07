import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ConfirmPane } from "./confirm-pane";

const props = {
  flow: "enable" as const,
  code: "",
  error: null,
  busy: false,
  onCode: () => {},
  onConfirm: () => {},
  onCancel: () => {},
};

describe("ConfirmPane", () => {
  it("numbers itself after the scan step when enabling", () => {
    render(<ConfirmPane {...props} />);
    expect(screen.getByText("Step 2 · confirm")).toBeInTheDocument();
  });

  // Regenerating never scans anything, so confirming is the first step.
  it("numbers itself first when regenerating", () => {
    render(<ConfirmPane {...props} flow="regenerate" />);
    expect(screen.getByText("Step 1 · confirm")).toBeInTheDocument();
  });

  // Five digits is not a TOTP code. Submitting one spends a failed attempt and
  // teaches the person nothing, so the control says what is missing instead.
  it("will not submit a short code, and says how short it is", async () => {
    const onConfirm = vi.fn();
    render(<ConfirmPane {...props} code="12345" onConfirm={onConfirm} />);

    const button = screen.getByRole("button", { name: "Enter 6 digits" });
    expect(button).toBeDisabled();
    await userEvent.click(button);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("submits at six digits", async () => {
    const onConfirm = vi.fn();
    render(<ConfirmPane {...props} code="123456" onConfirm={onConfirm} />);

    const button = screen.getByRole("button", { name: "Confirm" });
    expect(button).toBeEnabled();
    await userEvent.click(button);
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("hands each typed digit up as it is entered", async () => {
    const onCode = vi.fn();
    render(<ConfirmPane {...props} onCode={onCode} />);
    await userEvent.type(screen.getByRole("textbox", { name: "Digit 1 of 6" }), "4");
    expect(onCode).toHaveBeenCalledWith("4");
  });

  it("announces a refused code rather than only tinting the field", () => {
    render(<ConfirmPane {...props} error="Invalid code — check your device clock and try the next one." />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Invalid code — check your device clock and try the next one.",
    );
  });

  it("shows no alert when nothing has failed", () => {
    render(<ConfirmPane {...props} />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("marks the confirm busy while the gateway is answering", () => {
    render(<ConfirmPane {...props} code="123456" busy />);
    expect(screen.getByRole("button", { name: "Confirm" })).toHaveAttribute("aria-busy", "true");
  });

  it("leaves on cancel", async () => {
    const onCancel = vi.fn();
    render(<ConfirmPane {...props} onCancel={onCancel} />);
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("carries the three notes when enabling", () => {
    render(<ConfirmPane {...props} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(
      screen.getByText("The secret is generated server-side and only stored once you confirm a code."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Disabling 2FA later also asks for a code from your authenticator."),
    ).toBeInTheDocument();
  });

  // Regenerating generates no secret, so the note about one would be false.
  it("drops the note about generating a secret when regenerating", () => {
    render(<ConfirmPane {...props} flow="regenerate" />);
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(
      screen.queryByText("The secret is generated server-side and only stored once you confirm a code."),
    ).not.toBeInTheDocument();
  });
});
