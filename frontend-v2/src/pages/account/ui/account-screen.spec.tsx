import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AccountScreen } from "./account-screen";

const { useAccount } = vi.hoisted(() => ({ useAccount: vi.fn() }));
vi.mock("../model/use-account", () => ({ useAccount }));

describe("AccountScreen", () => {
  beforeEach(() => {
    useAccount.mockReset();
  });

  it("shows a loading skeleton while the principal is still in flight", () => {
    useAccount.mockReturnValue({ phase: "loading" });
    render(<AccountScreen />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("shows the error state when the account is unavailable", () => {
    useAccount.mockReturnValue({ phase: "unavailable", error: "boom" });
    render(<AccountScreen />);
    expect(screen.getByRole("alert")).toHaveTextContent("boom");
  });

  it("renders the page once the account is ready", () => {
    useAccount.mockReturnValue({
      phase: "ready",
      me: {
        id: "u-1", email: "a.ivanova@example.com", username: "a.ivanova", status: "active",
        totpEnabled: true, totpRequired: false, passkeyEnabled: true,
        roleSlugs: [], roleTitles: {}, permissions: [], isOwner: true, onboardingToursSeen: [],
      },
      twoFactor: null,
      passkeys: null,
      twoFactorLoading: false,
      passkeysLoading: false,
      activity: [],
      activityHasMore: false,
      activityBusy: false,
      passwordBusy: false,
      disableBusy: false,
      removalBusy: false,
      onChangePassword: vi.fn().mockResolvedValue(undefined),
      onDisable2FA: vi.fn().mockResolvedValue(undefined),
      onRemovePasskey: vi.fn().mockResolvedValue(undefined),
      onPasskeyAdded: vi.fn(),
      onLoadMore: vi.fn(),
    });
    render(<AccountScreen />);
    expect(screen.getByRole("heading", { level: 1, name: "a.ivanova" })).toBeInTheDocument();
    // Every section the ready phase owns, not only the header — a prop the
    // screen forgets to forward is otherwise invisible here.
    expect(screen.getByRole("heading", { level: 2, name: "Two-factor authentication" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Passkeys" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "My activity" })).toBeInTheDocument();
    expect(screen.getByText("Nothing to show yet")).toBeInTheDocument();
  });
});
