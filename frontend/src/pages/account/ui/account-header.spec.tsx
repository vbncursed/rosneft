import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Principal } from "@/shared/session";
import { AccountHeader as Header, type AccountHeaderProps } from "./account-header";

const AccountHeader = (p: Pick<AccountHeaderProps, "me"> & Partial<AccountHeaderProps>) => (
  <Header onSignOut={vi.fn()} signingOut={false} {...p} />
);

const me = (over: Partial<Principal> = {}): Principal => ({
  id: "u-1",
  email: "a.ivanova@example.com",
  username: "a.ivanova",
  status: "active",
  totpEnabled: true,
  totpRequired: false,
  passkeyEnabled: true,
  roleSlugs: [],
  roleTitles: {},
  permissions: [],
  isOwner: false,
  onboardingToursSeen: [],
  ...over,
});

describe("AccountHeader", () => {
  it("links back to Home", () => {
    render(<AccountHeader me={me()} />);
    expect(screen.getByRole("link", { name: "← Home" })).toHaveAttribute("href", "/");
  });

  it("names the section", () => {
    render(<AccountHeader me={me()} />);
    expect(screen.getByText("Account")).toBeInTheDocument();
  });

  it("shows the avatar, username and email · role line", () => {
    render(
      <AccountHeader me={me({ roleSlugs: ["admin"], roleTitles: { admin: "Company Owner" } })} />,
    );
    expect(screen.getByRole("img", { name: "a.ivanova" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "a.ivanova" })).toBeInTheDocument();
    expect(screen.getByText("a.ivanova@example.com · Company Owner")).toBeInTheDocument();
  });

  it("derives the role title the same way the sidebar does: Root for an ownerless owner, — otherwise", () => {
    const { rerender } = render(<AccountHeader me={me({ isOwner: true, roleSlugs: [] })} />);
    expect(screen.getByText("a.ivanova@example.com · Root")).toBeInTheDocument();

    rerender(<AccountHeader me={me({ roleSlugs: [] })} />);
    expect(screen.getByText("a.ivanova@example.com · —")).toBeInTheDocument();
  });

  it("signs out from its Sign out button", async () => {
    const onSignOut = vi.fn();
    render(<AccountHeader me={me()} onSignOut={onSignOut} />);
    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(onSignOut).toHaveBeenCalledOnce();
  });

  it("holds Sign out while one is on its way", () => {
    render(<AccountHeader me={me()} signingOut />);
    expect(screen.getByRole("button", { name: /Sign out/ })).toBeDisabled();
  });

  it("hosts the theme control", () => {
    render(<AccountHeader me={me()} />);
    expect(screen.getByRole("button", { name: /^Theme:/ })).toBeInTheDocument();
  });
});
