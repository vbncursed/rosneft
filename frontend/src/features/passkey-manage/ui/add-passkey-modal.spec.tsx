import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "@/shared/api";
import { clearNotices } from "@/shared/lib/notify";
import { Toaster } from "@/widgets/toaster";
import { AddPasskeyModal, type AddPasskeyModalProps } from "./add-passkey-modal";

const { beginRegistration, createCredential, finishRegistration, isCancelled } = vi.hoisted(() => ({
  beginRegistration: vi.fn(),
  createCredential: vi.fn(),
  finishRegistration: vi.fn(),
  isCancelled: vi.fn(),
}));

vi.mock("@/entities/passkey", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  beginRegistration,
  createCredential,
  finishRegistration,
  isCancelled,
}));

const CREDENTIAL = { id: "pk-1", name: "MacBook Pro", createdAt: "2026-09-01T00:00:00Z", lastUsedAt: null };

const props = (over: Partial<AddPasskeyModalProps> = {}): AddPasskeyModalProps => ({
  open: true,
  onClose: vi.fn(),
  onAdded: vi.fn(),
  factor: "password",
  ...over,
});

const fillPassword = (pw = "hunter2!") => userEvent.type(screen.getByLabelText("Account password"), pw);

afterEach(() => {
  clearNotices();
  vi.resetAllMocks();
});

describe("AddPasskeyModal", () => {
  it("keeps Continue disabled until a name and the factor are given", async () => {
    render(<AddPasskeyModal {...props()} />);
    const submit = screen.getByRole("button", { name: "Continue" });
    expect(submit).toBeDisabled();

    await userEvent.type(screen.getByLabelText("Passkey name"), "MacBook Pro");
    expect(submit).toBeDisabled();
    await fillPassword();
    expect(submit).toBeEnabled();
  });

  it("sends the password with the begin call", async () => {
    beginRegistration.mockResolvedValue({ optionsJson: "{}", flowId: "flow-1" });
    createCredential.mockResolvedValue("{}");
    finishRegistration.mockResolvedValue(CREDENTIAL);

    render(<AddPasskeyModal {...props()} />);
    await userEvent.type(screen.getByLabelText("Passkey name"), "MacBook Pro");
    await fillPassword("s3cret");
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => expect(beginRegistration).toHaveBeenCalledWith({ password: "s3cret" }));
  });

  it("sends the authenticator code with the begin call when 2FA is on", async () => {
    beginRegistration.mockResolvedValue({ optionsJson: "{}", flowId: "flow-1" });
    createCredential.mockResolvedValue("{}");
    finishRegistration.mockResolvedValue(CREDENTIAL);

    render(<AddPasskeyModal {...props({ factor: "code" })} />);
    await userEvent.type(screen.getByLabelText("Passkey name"), "MacBook Pro");
    for (let i = 0; i < 6; i++) await userEvent.type(screen.getByLabelText(`Digit ${i + 1} of 6`), "402913".charAt(i));
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => expect(beginRegistration).toHaveBeenCalledWith({ code: "402913" }));
  });

  // A stolen session that cannot answer the step-up must get nothing: the 403
  // is toasted, the ceremony never runs, and the form is back with the name kept.
  it("toasts a refused factor, skips the ceremony and returns to the form", async () => {
    beginRegistration.mockRejectedValue(new HttpError(403, null, "re-authentication failed"));
    const onClose = vi.fn();

    render(
      <>
        <Toaster />
        <AddPasskeyModal {...props({ onClose })} />
      </>,
    );
    await userEvent.type(screen.getByLabelText("Passkey name"), "MacBook Pro");
    await fillPassword("wrong");
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByText("re-authentication failed")).toBeInTheDocument();
    expect(createCredential).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Passkey name")).toHaveValue("MacBook Pro");
    expect(screen.getByLabelText("Account password")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
  });

  it("offers no way forward when the 2FA state is unavailable", async () => {
    render(<AddPasskeyModal {...props({ factor: "unavailable" })} />);
    await userEvent.type(screen.getByLabelText("Passkey name"), "MacBook Pro");
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    expect(screen.getByText(/Two-factor status is unavailable/)).toBeInTheDocument();
  });

  it("runs the ceremony and hands the server's credential to onAdded", async () => {
    beginRegistration.mockResolvedValue({ optionsJson: "{}", flowId: "flow-1" });
    createCredential.mockResolvedValue("{}");
    finishRegistration.mockResolvedValue(CREDENTIAL);
    const onAdded = vi.fn();
    const onClose = vi.fn();

    render(<AddPasskeyModal {...props({ onAdded, onClose })} />);
    await userEvent.type(screen.getByLabelText("Passkey name"), "MacBook Pro");
    await fillPassword();
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => expect(onAdded).toHaveBeenCalledWith(CREDENTIAL));
    expect(finishRegistration).toHaveBeenCalledWith("flow-1", "{}", "MacBook Pro");
    expect(onClose).toHaveBeenCalled();
  });

  // The dialog stays mounted and fades for 150 ms after closing: resetting
  // the step on the way out flashed "Name this passkey" and its buttons over
  // a ceremony that had just finished. The reset happens on the next open.
  it("holds the finished step through the exit and starts fresh on reopen", async () => {
    const exit = { finished: new Promise(() => {}) } as unknown as Animation;
    HTMLDialogElement.prototype.getAnimations = () => [exit];
    try {
      beginRegistration.mockResolvedValue({ optionsJson: "{}", flowId: "flow-1" });
      createCredential.mockResolvedValue("{}");
      finishRegistration.mockResolvedValue(CREDENTIAL);
      const onClose = vi.fn();
      const { rerender } = render(<AddPasskeyModal {...props({ onClose })} />);
      await userEvent.type(screen.getByLabelText("Passkey name"), "MacBook Pro");
      await fillPassword();
      await userEvent.click(screen.getByRole("button", { name: "Continue" }));
      await waitFor(() => expect(onClose).toHaveBeenCalled());

      rerender(<AddPasskeyModal {...props({ onClose, open: false })} />);
      expect(screen.getByText("Confirm on your device")).toBeInTheDocument();
      expect(screen.queryByText("Name this passkey")).not.toBeInTheDocument();

      rerender(<AddPasskeyModal {...props({ onClose, open: true })} />);
      expect(screen.getByText("Name this passkey")).toBeInTheDocument();
      expect(screen.getByLabelText("Passkey name")).toHaveValue("");
    } finally {
      delete (HTMLDialogElement.prototype as Partial<HTMLDialogElement>).getAnimations;
    }
  });

  it("trims leading and trailing whitespace off the typed name before sending it", async () => {
    beginRegistration.mockResolvedValue({ optionsJson: "{}", flowId: "flow-1" });
    createCredential.mockResolvedValue("{}");
    finishRegistration.mockResolvedValue(CREDENTIAL);

    render(<AddPasskeyModal {...props()} />);
    await userEvent.type(screen.getByLabelText("Passkey name"), "  MacBook Pro  ");
    await fillPassword();
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => expect(finishRegistration).toHaveBeenCalled());
    expect(finishRegistration).toHaveBeenCalledWith("flow-1", "{}", "MacBook Pro");
  });

  it("closes with no toast when the system prompt is dismissed", async () => {
    const dismissed = new DOMException("dismissed", "NotAllowedError");
    beginRegistration.mockResolvedValue({ optionsJson: "{}", flowId: "flow-1" });
    createCredential.mockRejectedValue(dismissed);
    isCancelled.mockReturnValue(true);
    const onClose = vi.fn();

    render(
      <>
        <Toaster />
        <AddPasskeyModal {...props({ onClose })} />
      </>,
    );
    await userEvent.type(screen.getByLabelText("Passkey name"), "MacBook Pro");
    await fillPassword();
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("toasts any other ceremony failure", async () => {
    beginRegistration.mockResolvedValue({ optionsJson: "{}", flowId: "flow-1" });
    createCredential.mockRejectedValue(new Error("boom"));
    isCancelled.mockReturnValue(false);

    render(
      <>
        <Toaster />
        <AddPasskeyModal {...props()} />
      </>,
    );
    await userEvent.type(screen.getByLabelText("Passkey name"), "MacBook Pro");
    await fillPassword();
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByText("Something went wrong. Try again.")).toBeInTheDocument();
  });
});
