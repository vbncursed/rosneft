import { createEvent, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CatalogShellRoute } from "./catalog-shell-route";

const { useQuery, useOfflineUser, pathname, navigate } = vi.hoisted(() => ({
  navigate: vi.fn(),
  useQuery: vi.fn(),
  useOfflineUser: vi.fn(),
  pathname: { value: "/territories" },
}));
vi.mock("@tanstack/react-query", async (real) => ({
  ...(await real<typeof import("@tanstack/react-query")>()),
  useQuery,
}));
vi.mock("@/features/offline-save", () => ({ useOfflineUser }));
vi.mock("@/widgets/offline-banner", () => ({ OfflineBanner: () => null }));
vi.mock("@/widgets/toaster", () => ({ Toaster: () => null }));
vi.mock("@tanstack/react-router", () => ({
  Outlet: () => (
    <p>
      Catalog screen{" "}
      <a href="/models">
        <span>nested</span>
      </a>
      <a href="https://example.com">external</a>
      <a>no href</a>
    </p>
  ),
  useNavigate: () => navigate,
  useRouterState: () => pathname.value,
}));

beforeEach(() => {
  navigate.mockReset();
  useQuery.mockReset();
  useOfflineUser.mockReset();
  pathname.value = "/territories";
});

describe("CatalogShellRoute", () => {
  it("tells the offline store whose copies to list", () => {
    useQuery.mockReturnValue({ data: { id: "u-7" } });
    render(<CatalogShellRoute />);
    expect(useOfflineUser).toHaveBeenCalledWith("u-7");
  });

  it("passes undefined without a principal", () => {
    useQuery.mockReturnValue({ data: undefined });
    const { container } = render(<CatalogShellRoute />);
    expect(useOfflineUser).toHaveBeenCalledWith(undefined);
    expect(container).toBeEmptyDOMElement();
  });

  it.each([
    ["/territories", false],
    ["/territories/new", false],
    ["/territories/north-ridge", true],
  ])("places the screen in the appropriate layout at %s", (path, fullbleed) => {
    pathname.value = path;
    useQuery.mockReturnValue({ data: { id: "u-7" } });
    render(<CatalogShellRoute />);
    const main = screen.getByRole("main");
    expect(main).toHaveTextContent("Catalog screen");
    expect(main.parentElement?.hasAttribute("data-fullbleed")).toBe(fullbleed);
  });
  it("intercepts a nested in-app link", () => {
    useQuery.mockReturnValue({ data: { id: "u-7" } });
    render(<CatalogShellRoute />);
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
    useQuery.mockReturnValue({ data: { id: "u-7" } });
    render(<CatalogShellRoute />);
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
