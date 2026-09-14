import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
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
  ...over,
});

afterEach(() => {
  clearNotices();
  vi.resetAllMocks();
});

describe("AddPasskeyModal", () => {
  it("keeps Continue disabled until a name is typed", async () => {
    render(<AddPasskeyModal {...props()} />);
    const submit = screen.getByRole("button", { name: "Continue" });
    expect(submit).toBeDisabled();

    await userEvent.type(screen.getByLabelText("Passkey name"), "MacBook Pro");
    expect(submit).toBeEnabled();
  });

  it("runs the ceremony and hands the server's credential to onAdded", async () => {
    beginRegistration.mockResolvedValue({ optionsJson: "{}", flowId: "flow-1" });
    createCredential.mockResolvedValue("{}");
    finishRegistration.mockResolvedValue(CREDENTIAL);
    const onAdded = vi.fn();
    const onClose = vi.fn();

    render(<AddPasskeyModal {...props({ onAdded, onClose })} />);
    await userEvent.type(screen.getByLabelText("Passkey name"), "MacBook Pro");
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => expect(onAdded).toHaveBeenCalledWith(CREDENTIAL));
    expect(finishRegistration).toHaveBeenCalledWith("flow-1", "{}", "MacBook Pro");
    expect(onClose).toHaveBeenCalled();
  });

  it("trims leading and trailing whitespace off the typed name before sending it", async () => {
    beginRegistration.mockResolvedValue({ optionsJson: "{}", flowId: "flow-1" });
    createCredential.mockResolvedValue("{}");
    finishRegistration.mockResolvedValue(CREDENTIAL);

    render(<AddPasskeyModal {...props()} />);
    await userEvent.type(screen.getByLabelText("Passkey name"), "  MacBook Pro  ");
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
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByText("Something went wrong. Try again.")).toBeInTheDocument();
  });
});
