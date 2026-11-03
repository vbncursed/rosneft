import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CatalogShellRoute } from "./catalog-shell-route";

const { useQuery, useOfflineUser, pathname } = vi.hoisted(() => ({
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
  Outlet: () => <p>Catalog screen</p>,
  useNavigate: () => vi.fn(),
  useRouterState: () => pathname.value,
}));

beforeEach(() => {
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
});
