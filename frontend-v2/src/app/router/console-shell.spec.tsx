import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Principal } from "@/shared/session";
import { ConsoleShell } from "./console-shell";

const { useQuery } = vi.hoisted(() => ({ useQuery: vi.fn() }));
vi.mock("@tanstack/react-query", async (real) => ({
  ...(await real<typeof import("@tanstack/react-query")>()),
  useQuery,
}));
// A stand-in for the router context: the shell is rendered on its own.
vi.mock("@tanstack/react-router", () => ({
  Outlet: () => <p>screen</p>,
  useLocation: () => ({ pathname: "/console/users" }),
  useNavigate: () => vi.fn(),
}));

const me: Principal = {
  id: "u-1",
  email: "a.ivanova@example.com",
  username: "a.ivanova",
  status: "active",
  totpEnabled: true,
  totpRequired: false,
  passkeyEnabled: null,
  roleSlugs: [],
  roleTitles: {},
  permissions: [],
  isOwner: true,
  onboardingToursSeen: [],
};

beforeEach(() => {
  useQuery.mockReset();
  useQuery.mockReturnValue({ data: me });
});

describe("ConsoleShell", () => {
  it("points the sidebar's way out at Home, which frontend-v2 now serves", () => {
    render(<ConsoleShell />);
    expect(screen.getByRole("link", { name: "← Back to site" })).toHaveAttribute("href", "/");
  });

  it("draws nothing at all without a principal in the cache", () => {
    useQuery.mockReturnValue({ data: undefined });
    const { container } = render(<ConsoleShell />);
    expect(container).toBeEmptyDOMElement();
  });
});
