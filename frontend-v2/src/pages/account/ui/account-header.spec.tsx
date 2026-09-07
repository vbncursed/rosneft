import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Principal } from "@/shared/session";
import { AccountHeader } from "./account-header";

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
  it("links back to the console", () => {
    render(<AccountHeader me={me()} />);
    expect(screen.getByRole("link", { name: "← Back to console" })).toHaveAttribute("href", "/console");
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

  it("hosts the theme control", () => {
    render(<AccountHeader me={me()} />);
    expect(screen.getByRole("button", { name: /^Theme:/ })).toBeInTheDocument();
  });
});
