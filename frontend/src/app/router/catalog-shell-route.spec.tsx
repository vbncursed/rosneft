import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CatalogShellRoute } from "./catalog-shell-route";

const { useQuery, useOfflineUser } = vi.hoisted(() => ({ useQuery: vi.fn(), useOfflineUser: vi.fn() }));
vi.mock("@tanstack/react-query", async (real) => ({
  ...(await real<typeof import("@tanstack/react-query")>()),
  useQuery,
}));
vi.mock("@/features/offline-save", () => ({ useOfflineUser }));
vi.mock("@/widgets/catalog-shell", () => ({ CatalogShell: () => <p>shell</p> }));
vi.mock("@/widgets/offline-banner", () => ({ OfflineBanner: () => null }));
vi.mock("@/widgets/toaster", () => ({ Toaster: () => null }));
vi.mock("@tanstack/react-router", () => ({
  Outlet: () => null,
  useNavigate: () => vi.fn(),
  useRouterState: () => "/territories",
}));

beforeEach(() => {
  useQuery.mockReset();
  useOfflineUser.mockReset();
});

describe("CatalogShellRoute", () => {
  it("tells the offline store whose copies to list", () => {
    useQuery.mockReturnValue({ data: { id: "u-7" } });
    render(<CatalogShellRoute />);
    expect(useOfflineUser).toHaveBeenCalledWith("u-7");
  });

  it("passes undefined without a principal", () => {
    useQuery.mockReturnValue({ data: undefined });
    render(<CatalogShellRoute />);
    expect(useOfflineUser).toHaveBeenCalledWith(undefined);
  });
});
