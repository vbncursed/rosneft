import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Principal } from "@/shared/session";
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

const props = (over: Partial<AccountPageProps> = {}): AccountPageProps => ({
  me: ME,
  twoFactor: { enabled: true, enabledAt: "2026-08-12T09:20:00Z", recoveryRemaining: 7, recoveryTotal: 10 },
  passkeys: [{ id: "p-1", name: "MacBook Pro", createdAt: "2026-08-12T09:20:00Z", lastUsedAt: null }],
  passwordBusy: false,
  onChangePassword: vi.fn(),
  ...over,
});

describe("AccountPage", () => {
  it("draws no chrome of its own — the shell owns the layout", () => {
    render(<AccountPage {...props()} />);
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    expect(screen.queryByRole("main")).not.toBeInTheDocument();
  });

  it("shows the header, the three posture cards and the password form", () => {
    render(<AccountPage {...props()} />);
    expect(screen.getByRole("heading", { level: 1, name: "a.ivanova" })).toBeInTheDocument();
    expect(screen.getByText("Two-factor")).toBeInTheDocument();
    expect(screen.getByText("Passkeys")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Password" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Change password" })).toBeInTheDocument();
  });

  it("counts the passkeys array it was handed, not a raw number", () => {
    render(<AccountPage {...props({ passkeys: [] })} />);
    expect(screen.getByText("0")).toBeInTheDocument();
  });

  it("reads an unknown passkey count as unknown, not zero", () => {
    render(<AccountPage {...props({ passkeys: null })} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
