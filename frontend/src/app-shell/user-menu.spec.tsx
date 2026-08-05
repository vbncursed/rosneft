// Run with: yarn test:spa  (vitest + jsdom).
//
// cleanup is wired by hand: vitest runs without `globals`, so testing-library
// cannot register its own afterEach hook.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => <a href={to}>{children}</a>,
}));

const useCurrentUser = vi.fn();
vi.mock("@/auth/presentation/current-user-context", () => ({
  useCurrentUser: () => useCurrentUser(),
}));

vi.mock("@/auth/infrastructure/auth-login", () => ({
  logout: vi.fn(),
}));

import UserMenu from "./user-menu";

const principal = (roleSlugs: string[], roleTitles: Record<string, string>) => ({
  id: "user-7",
  email: "a@b.c",
  username: "vbncursed",
  status: "active" as const,
  totpEnabled: false,
  passkeyEnabled: null,
  roleSlugs,
  roleTitles,
  permissions: [],
  isOwner: false,
  onboardingToursSeen: [],
});

function open() {
  render(<UserMenu />);
  fireEvent.click(screen.getByRole("button", { name: /vb/i }));
}

afterEach(() => {
  cleanup();
  useCurrentUser.mockReset();
});

describe("UserMenu", () => {
  // The bug: the menu printed the slug. Slug "admin" is titled "Company Owner"
  // and a *different* role is slugged "owner", so the raw slug named another
  // role that exists rather than abbreviating the right one.
  it("names the role by its title, not its slug", () => {
    useCurrentUser.mockReturnValue(principal(["admin"], { admin: "Company Owner" }));

    open();

    expect(screen.getByText("Company Owner")).toBeTruthy();
    expect(screen.queryByText("admin")).toBeNull();
  });

  // A role deleted after it was granted has no title to look up. Showing the
  // slug is worse than the title and far better than showing nothing.
  it("falls back to the slug when the title is missing", () => {
    useCurrentUser.mockReturnValue(principal(["ghost"], {}));

    open();

    expect(screen.getByText("ghost")).toBeTruthy();
  });

  it("renders one chip per role", () => {
    useCurrentUser.mockReturnValue(
      principal(["admin", "editor"], { admin: "Company Owner", editor: "Scene Editor" }),
    );

    open();

    expect(screen.getByText("Company Owner")).toBeTruthy();
    expect(screen.getByText("Scene Editor")).toBeTruthy();
  });
});
