import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Principal } from "@/shared/session";

// jsdom answers `supported()` false, which is the browser-cannot-hold-passkeys
// shape. These cases are about the rest of the screen, so the gate is opened.
vi.mock("@/entities/passkey", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  isPasskeySupported: () => true,
}));
import { AccountPage, type AccountPageProps } from "./account-page";

const ME: Principal = {
  id: "u-1",
  email: "a.ivanova@example.com",
  username: "a.ivanova",
  status: "active",
  totpEnabled: true,
  totpRequired: false,
  passkeyEnabled: true,
  roleSlugs: ["admin"],
  roleTitles: { admin: "Company Owner" },
  permissions: [],
  isOwner: true,
  onboardingToursSeen: [],
};

const ENTRY = {
  id: 9,
  at: "2026-09-07T09:14:00Z",
  actorId: "u-1",
  actorLogin: "a.ivanova",
  companyId: "",
  companyLogin: "",
  action: "auth.login",
  entity: "session",
  entityId: "s-1",
  entityLabel: "",
  territorySlug: "",
  oldRow: null,
  newRow: null,
  result: "ok" as const,
};

const props = (over: Partial<AccountPageProps> = {}): AccountPageProps => ({
  me: ME,
  twoFactor: { enabled: true, enabledAt: "2026-08-12T09:20:00Z", recoveryRemaining: 7, recoveryTotal: 10 },
  passkeys: [{ id: "p-1", name: "MacBook Pro", createdAt: "2026-08-12T09:20:00Z", lastUsedAt: null }],
  twoFactorLoading: false,
  passkeysLoading: false,
  activity: [ENTRY],
  activityTotal: 1,
  activityPage: 1,
  activityPageCount: 1,
  activityBusy: false,
  passwordBusy: false,
  disableBusy: false,
  removalBusy: false,
  onChangePassword: vi.fn().mockResolvedValue(undefined),
  onDisable2FA: vi.fn().mockResolvedValue(undefined),
  onRemovePasskey: vi.fn().mockResolvedValue(undefined),
  onPasskeyAdded: vi.fn(),
  onPage: vi.fn(),
  ...over,
});

describe("AccountPage", () => {
  it("draws no chrome of its own — the shell owns the layout", () => {
    render(<AccountPage {...props()} />);
    // The feed's pager is a navigation landmark, and it is content: it moves
    // within this page rather than around the app. Nothing else may be one.
    expect(screen.getAllByRole("navigation").map((n) => n.getAttribute("aria-label"))).toEqual(["Pages"]);
    expect(screen.queryByRole("main")).not.toBeInTheDocument();
  });

  it("shows the header, the three posture cards and the password form", () => {
    render(<AccountPage {...props()} />);
    expect(screen.getByRole("heading", { level: 1, name: "a.ivanova" })).toBeInTheDocument();
    expect(screen.getByText("Two-factor")).toBeInTheDocument();
    // The posture card's label, not the section heading below it.
    expect(screen.getByText("Passkeys", { selector: "p" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Password" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Change password" })).toBeInTheDocument();
  });

  it("counts the passkeys array it was handed, not a raw number", () => {
    render(<AccountPage {...props({ passkeys: [] })} />);
    expect(screen.getByText("0", { selector: "p" })).toBeInTheDocument();
  });

  it("reads an unknown passkey count as unknown, not zero", () => {
    render(<AccountPage {...props({ passkeys: null })} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("forwards each side query's loading state to its own card", () => {
    render(<AccountPage {...props({ twoFactorLoading: true })} />);
    expect(screen.queryByText("TOTP")).not.toBeInTheDocument();
    // Passkeys is not loading — its value still prints. Scoped to the card's
    // own element: the pager's "Page 1" chip carries the same text.
    expect(screen.getByText("1", { selector: "p" })).toBeInTheDocument();
  });

  it("shows all five sections", () => {
    render(<AccountPage {...props()} />);
    for (const name of ["Password", "Two-factor authentication", "Passkeys", "My activity"]) {
      expect(screen.getByRole("heading", { level: 2, name })).toBeInTheDocument();
    }
    expect(screen.getByText("auth.login")).toBeInTheDocument();
  });

  // The summary is the page's own arithmetic over the props it was handed —
  // the section is told the string, it does not count the rows it drew.
  it("computes the feed's summary from the page and the total", () => {
    render(<AccountPage {...props()} />);
    expect(screen.getByText("1–1 of 1 events")).toBeInTheDocument();
  });

  it("opens the disable dialog from the two-factor card and submits a code through it", async () => {
    const onDisable2FA = vi.fn().mockResolvedValue(undefined);
    render(<AccountPage {...props({ onDisable2FA })} />);
    await userEvent.click(screen.getByRole("button", { name: "Disable 2FA" }));
    await userEvent.type(screen.getByRole("textbox", { name: /digit 1/i }), "123456");
    await userEvent.click(screen.getByRole("button", { name: "Disable" }));
    expect(onDisable2FA).toHaveBeenCalledExactlyOnceWith("123456");
    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: "Turn two-factor off?" })).not.toBeInTheDocument(),
    );
  });

  it("backs out of the disable dialog without touching two-factor", async () => {
    const onDisable2FA = vi.fn().mockResolvedValue(undefined);
    render(<AccountPage {...props({ onDisable2FA })} />);
    await userEvent.click(screen.getByRole("button", { name: "Disable 2FA" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("heading", { name: "Turn two-factor off?" })).not.toBeInTheDocument();
    expect(onDisable2FA).not.toHaveBeenCalled();
  });

  it("leaves the disable dialog up when the code is refused", async () => {
    const onDisable2FA = vi.fn().mockRejectedValue(new Error("invalid code"));
    render(<AccountPage {...props({ onDisable2FA })} />);
    await userEvent.click(screen.getByRole("button", { name: "Disable 2FA" }));
    await userEvent.type(screen.getByRole("textbox", { name: /digit 1/i }), "000000");
    await userEvent.click(screen.getByRole("button", { name: "Disable" }));
    expect(screen.getByRole("heading", { name: "Turn two-factor off?" })).toBeInTheDocument();
  });

  // The section reads the principal, not the 2FA status query: the two can
  // disagree for one round trip after a change, and the gateway derives the
  // required factor from the same principal.
  it("asks a passkey removal for the factor me.totpEnabled names", async () => {
    render(<AccountPage {...props({ me: { ...ME, totpEnabled: false } })} />);
    await userEvent.click(screen.getByRole("button", { name: "Remove MacBook Pro" }));
    expect(screen.getByLabelText("Account password")).toBeInTheDocument();
  });

  it("says two-factor is unknown without claiming it is off", () => {
    render(<AccountPage {...props({ twoFactor: null })} />);
    expect(screen.getByText("Two-factor status is unavailable right now.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Enable two-factor" })).not.toBeInTheDocument();
  });
});
