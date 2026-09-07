import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Passkey } from "@/entities/passkey";
import { PasskeysSection } from "./passkeys-section";

const { isPasskeySupported, beginRegistration, createCredential, finishRegistration } = vi.hoisted(() => ({
  isPasskeySupported: vi.fn(() => true),
  beginRegistration: vi.fn(),
  createCredential: vi.fn(),
  finishRegistration: vi.fn(),
}));
vi.mock("@/entities/passkey", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  isPasskeySupported,
  beginRegistration,
  createCredential,
  finishRegistration,
}));

const KEYS: Passkey[] = [
  { id: "p-1", name: "MacBook Pro", createdAt: "2026-08-12T09:20:00Z", lastUsedAt: "2026-09-07T09:14:00Z" },
  { id: "p-2", name: "iPhone 15", createdAt: "2026-07-03T09:20:00Z", lastUsedAt: null },
];

const props = (over: Partial<Parameters<typeof PasskeysSection>[0]> = {}) => ({
  passkeys: KEYS,
  loading: false,
  totpEnabled: true,
  removalBusy: false,
  onRemove: vi.fn().mockResolvedValue(undefined),
  onAdded: vi.fn(),
  ...over,
});

beforeEach(() => isPasskeySupported.mockReturnValue(true));

describe("PasskeysSection · populated", () => {
  it("counts the keys and lists every one of them", () => {
    render(<PasskeysSection {...props()} />);
    expect(screen.getByText("2 registered")).toBeInTheDocument();
    expect(screen.getByText("MacBook Pro")).toBeInTheDocument();
    expect(screen.getByText("iPhone 15")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ Add passkey" })).toBeInTheDocument();
  });

  // Each Remove button is named after its own key: several rows of "Remove"
  // are indistinguishable to a screen reader.
  it("names each removal after the key it removes", () => {
    render(<PasskeysSection {...props()} />);
    expect(screen.getByRole("button", { name: "Remove MacBook Pro" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove iPhone 15" })).toBeInTheDocument();
  });

  it("asks for a code when this account has two-factor on", async () => {
    render(<PasskeysSection {...props({ totpEnabled: true })} />);
    await userEvent.click(screen.getByRole("button", { name: "Remove MacBook Pro" }));
    expect(screen.getByRole("heading", { name: /Remove .MacBook Pro./ })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Authenticator code" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Account password")).not.toBeInTheDocument();
  });

  // The factor is read off the principal, not assumed. Asking for a password
  // on a 2FA account (or the reverse) is refused by the gateway, so a wrong
  // guess here is a dead end the user cannot get out of.
  it("asks for the password when this account has two-factor off", async () => {
    render(<PasskeysSection {...props({ totpEnabled: false })} />);
    await userEvent.click(screen.getByRole("button", { name: "Remove iPhone 15" }));
    expect(screen.getByLabelText("Account password")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Authenticator code" })).not.toBeInTheDocument();
  });

  it("collects nothing when it cannot know which factor the server wants", async () => {
    render(<PasskeysSection {...props({ totpEnabled: null })} />);
    await userEvent.click(screen.getByRole("button", { name: "Remove MacBook Pro" }));
    expect(screen.getByRole("heading", { name: "Two-factor status unavailable" })).toBeInTheDocument();
  });

  it("removes the key the row belongs to and closes on success", async () => {
    const onRemove = vi.fn().mockResolvedValue(undefined);
    render(<PasskeysSection {...props({ totpEnabled: false, onRemove })} />);
    await userEvent.click(screen.getByRole("button", { name: "Remove iPhone 15" }));
    await userEvent.type(screen.getByLabelText("Account password"), "hunter2");
    await userEvent.click(screen.getByRole("button", { name: /^Remove$/ }));
    expect(onRemove).toHaveBeenCalledExactlyOnceWith("p-2", { password: "hunter2" });
    expect(screen.queryByRole("heading", { name: /Remove .iPhone 15./ })).not.toBeInTheDocument();
  });

  it("backs out of a removal without removing anything", async () => {
    const onRemove = vi.fn().mockResolvedValue(undefined);
    render(<PasskeysSection {...props({ totpEnabled: false, onRemove })} />);
    await userEvent.click(screen.getByRole("button", { name: "Remove iPhone 15" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("heading", { name: /Remove .iPhone 15./ })).not.toBeInTheDocument();
    expect(onRemove).not.toHaveBeenCalled();
  });

  it("leaves the dialog open when the removal is refused", async () => {
    const onRemove = vi.fn().mockRejectedValue(new Error("wrong password"));
    render(<PasskeysSection {...props({ totpEnabled: false, onRemove })} />);
    await userEvent.click(screen.getByRole("button", { name: "Remove iPhone 15" }));
    await userEvent.type(screen.getByLabelText("Account password"), "nope");
    await userEvent.click(screen.getByRole("button", { name: /^Remove$/ }));
    expect(screen.getByRole("heading", { name: /Remove .iPhone 15./ })).toBeInTheDocument();
  });
});

describe("PasskeysSection · adding", () => {
  it("opens the naming step and closes again without starting a ceremony", async () => {
    render(<PasskeysSection {...props()} />);
    await userEvent.click(screen.getByRole("button", { name: "+ Add passkey" }));
    expect(screen.getByRole("heading", { name: "Name this passkey" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("heading", { name: "Name this passkey" })).not.toBeInTheDocument();
    expect(beginRegistration).not.toHaveBeenCalled();
  });

  // The section does not hold the new key itself — the list is a query, and
  // the caller invalidates it. Forgetting to forward this is how a freshly
  // registered passkey stays invisible until a reload.
  it("tells the caller a passkey was registered so the list can refresh", async () => {
    const added = { id: "p-9", name: "Probe", createdAt: "2026-09-07T00:00:00Z", lastUsedAt: null };
    beginRegistration.mockResolvedValue({ optionsJson: "{}", flowId: "f-1" });
    createCredential.mockResolvedValue("{}");
    finishRegistration.mockResolvedValue(added);
    const onAdded = vi.fn();
    render(<PasskeysSection {...props({ onAdded })} />);
    await userEvent.click(screen.getByRole("button", { name: "+ Add passkey" }));
    await userEvent.type(screen.getByLabelText("Passkey name"), "Probe");
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(onAdded).toHaveBeenCalledExactlyOnceWith(added));
    expect(screen.queryByRole("heading", { name: "Name this passkey" })).not.toBeInTheDocument();
  });
});

describe("PasskeysSection · empty", () => {
  it("names the gap and still offers the way out of it", () => {
    render(<PasskeysSection {...props({ passkeys: [] })} />);
    expect(screen.getByText("0 registered")).toBeInTheDocument();
    expect(screen.getByText("No passkeys yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ Add passkey" })).toBeInTheDocument();
  });
});

describe("PasskeysSection · list unavailable", () => {
  // null is not zero. Reporting "0 registered" for a query that failed would
  // tell the user their keys are gone.
  it("says the list could not be loaded rather than reporting none", () => {
    render(<PasskeysSection {...props({ passkeys: null })} />);
    expect(screen.getByText("Passkeys could not be loaded.")).toBeInTheDocument();
    expect(screen.queryByText("0 registered")).not.toBeInTheDocument();
    expect(screen.queryByText("No passkeys yet")).not.toBeInTheDocument();
  });
});

describe("PasskeysSection · loading", () => {
  it("waits rather than claiming the list is unavailable", () => {
    render(<PasskeysSection {...props({ passkeys: null, loading: true })} />);
    expect(screen.getByRole("status", { name: "Loading passkeys" })).toBeInTheDocument();
    expect(screen.queryByText("Passkeys could not be loaded.")).not.toBeInTheDocument();
  });
});

describe("PasskeysSection · browser cannot hold passkeys", () => {
  it("explains why and offers no way to start a ceremony that would fail", () => {
    isPasskeySupported.mockReturnValue(false);
    render(<PasskeysSection {...props()} />);
    expect(screen.getByText("This browser cannot hold passkeys")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "+ Add passkey" })).not.toBeInTheDocument();
    expect(screen.queryByText("MacBook Pro")).not.toBeInTheDocument();
  });
});
