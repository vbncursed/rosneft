import { createEvent, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Principal } from "@/shared/session";
import { ConsoleShell } from "./console-shell";

const { useQuery, navigate } = vi.hoisted(() => ({ useQuery: vi.fn(), navigate: vi.fn() }));
vi.mock("@tanstack/react-query", async (real) => ({
  ...(await real<typeof import("@tanstack/react-query")>()),
  useQuery,
}));
const { useOfflineUser } = vi.hoisted(() => ({ useOfflineUser: vi.fn() }));
vi.mock("@/features/offline-save", () => ({ useOfflineUser }));
// A stand-in for the router context: the shell is rendered on its own.
vi.mock("@tanstack/react-router", () => ({
  Outlet: () => (
    <p>
      screen{" "}
      <a href="/models">
        <span>nested</span>
      </a>
      <a href="https://example.com">external</a>
      <a>no href</a>
    </p>
  ),
  useLocation: () => ({ pathname: "/console/users" }),
  useNavigate: () => navigate,
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
  navigate.mockReset();
  useQuery.mockReset();
  useQuery.mockReturnValue({ data: me });
});

describe("ConsoleShell", () => {
  it("points the sidebar's way out at Home, which this SPA serves", () => {
    render(<ConsoleShell />);
    expect(screen.getByRole("link", { name: "← Back to site" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("main")).toHaveTextContent("screen");
  });

  it("draws nothing at all without a principal in the cache", () => {
    useQuery.mockReturnValue({ data: undefined });
    const { container } = render(<ConsoleShell />);
    expect(container).toBeEmptyDOMElement();
  });

  it("tells the offline store whose copies to list", () => {
    render(<ConsoleShell />);
    expect(useOfflineUser).toHaveBeenCalledWith("u-1");
  });
  it("intercepts a nested in-app link", () => {
    render(<ConsoleShell />);
    const event = createEvent.click(screen.getByText("nested"), { button: 0 });
    fireEvent(screen.getByText("nested"), event);
    expect(event.defaultPrevented).toBe(true);
    expect(navigate).toHaveBeenCalledWith({ href: "/models" });
  });

  it.each([
    ["external", {}],
    ["no href", {}],
    ["nested", { metaKey: true }],
    ["nested", { ctrlKey: true }],
    ["nested", { shiftKey: true }],
    ["nested", { altKey: true }],
    ["nested", { button: 1 }],
  ])("leaves %s clicks to the browser (%o)", (label, options) => {
    render(<ConsoleShell />);
    const target = screen.getByText(label);
    const event = createEvent.click(target, options);
    // Prevent jsdom navigation after the capture handler has run.
    target.addEventListener("click", (e) => e.preventDefault(), { once: true });
    const preventedBeforeTarget = vi.fn((e: Event) => expect(e.defaultPrevented).toBe(false));
    target.addEventListener("click", preventedBeforeTarget, { capture: true, once: true });
    fireEvent(target, event);
    expect(preventedBeforeTarget).toHaveBeenCalledOnce();
    expect(navigate).not.toHaveBeenCalled();
  });
});
