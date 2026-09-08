import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TerritoryCardModel } from "../model/catalog";
import type { TerritoryCatalogState } from "../model/use-territory-catalog";
import { TerritoryCatalogScreen } from "./territory-catalog-screen";

const { useTerritoryCatalog, leaveTo, navigate } = vi.hoisted(() => ({
  useTerritoryCatalog: vi.fn(),
  leaveTo: vi.fn(),
  navigate: vi.fn(),
}));
vi.mock("../model/use-territory-catalog", () => ({ useTerritoryCatalog }));
vi.mock("@/shared/lib/leave", () => ({ leaveTo }));
// A stand-in for the router context: the screen is rendered on its own.
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => navigate }));

const T1: TerritoryCardModel = {
  slug: "t-1",
  title: "T 1",
  status: "ready",
  chips: [{ label: "3 placements", tone: "plain" }],
  trailing: { label: "Open →", tone: "accent" },
  openable: true,
  panorama: false,
};
const T2: TerritoryCardModel = {
  slug: "t-2",
  title: "T 2",
  status: "pending",
  chips: [{ label: "—", tone: "plain" }, { label: "—", tone: "plain" }],
  trailing: { label: "pending", tone: "muted" },
  openable: false,
  panorama: false,
};

const state = (over: Partial<TerritoryCatalogState> = {}): TerritoryCatalogState => ({
  status: "ready",
  error: null,
  cards: [T1, T2],
  tab: "all",
  setTab: vi.fn(),
  query: "",
  setQuery: vi.fn(),
  canUpload: true,
  canDelete: true,
  canReplace: true,
  pending: null,
  ask: vi.fn(),
  confirm: vi.fn(),
  dismiss: vi.fn(),
  busy: false,
  ...over,
});

beforeEach(() => {
  useTerritoryCatalog.mockReset();
  leaveTo.mockReset();
  navigate.mockReset();
});

describe("TerritoryCatalogScreen", () => {
  it("shows skeletons while loading and the gateway's sentence when unavailable", () => {
    useTerritoryCatalog.mockReturnValue(state({ status: "loading", cards: null }));
    const { unmount } = render(<TerritoryCatalogScreen />);
    expect(screen.getByRole("status", { name: "Loading territories" })).toBeInTheDocument();
    unmount();
    useTerritoryCatalog.mockReturnValue(
      state({ status: "unavailable", cards: null, error: "You don't have permission to do this" }),
    );
    render(<TerritoryCatalogScreen />);
    expect(screen.getByRole("alert")).toHaveTextContent("You don't have permission to do this");
  });

  it("counts every card regardless of the current tab or query", () => {
    useTerritoryCatalog.mockReturnValue(state({ tab: "ready", query: "t" }));
    render(<TerritoryCatalogScreen />);
    expect(screen.getByRole("radio", { name: "All · 2" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Ready · 1" })).toBeInTheDocument();
  });

  it("narrows the cards through the pure filter", () => {
    useTerritoryCatalog.mockReturnValue(state({ tab: "ready" }));
    render(<TerritoryCatalogScreen />);
    expect(screen.getByRole("article", { name: "T 1" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "T 2" })).not.toBeInTheDocument();
  });

  it("navigates to the territory's own page rather than leaving the SPA", async () => {
    useTerritoryCatalog.mockReturnValue(state());
    render(<TerritoryCatalogScreen />);
    await userEvent.click(screen.getByRole("article", { name: "T 1" }));
    expect(navigate).toHaveBeenCalledWith({ href: "/territories/t-1" });
    expect(leaveTo).not.toHaveBeenCalled();
  });

  it("navigates to the replace form rather than leaving the SPA", async () => {
    useTerritoryCatalog.mockReturnValue(state());
    render(<TerritoryCatalogScreen />);
    await userEvent.click(screen.getByRole("button", { name: "Replace source of T 1" }));
    expect(navigate).toHaveBeenCalledWith({ href: "/territories/t-1/replace" });
    expect(leaveTo).not.toHaveBeenCalled();
  });

  it("navigates to the v2 upload route rather than leaving the SPA", async () => {
    useTerritoryCatalog.mockReturnValue(state());
    render(<TerritoryCatalogScreen />);
    await userEvent.click(screen.getByRole("button", { name: "+ Upload" }));
    expect(navigate).toHaveBeenCalledWith({ to: "/territories/new" });
    expect(leaveTo).not.toHaveBeenCalled();
  });

  it("asks before deleting and hands the slug to the container", async () => {
    const ask = vi.fn();
    useTerritoryCatalog.mockReturnValue(state({ ask }));
    render(<TerritoryCatalogScreen />);
    await userEvent.click(screen.getByRole("button", { name: "Delete T 1" }));
    expect(ask).toHaveBeenCalledWith("t-1");
  });

  it("confirms the delete dialog with the pending card's title and description", async () => {
    const confirm = vi.fn();
    useTerritoryCatalog.mockReturnValue(state({ pending: T1, confirm }));
    render(<TerritoryCatalogScreen />);
    const dialog = screen.getByRole("dialog", { name: "Delete T 1?" });
    expect(dialog).toHaveTextContent(
      "Its placements, panoramas and documents go with it. This cannot be undone.",
    );
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(confirm).toHaveBeenCalled();
  });

  it("draws no dialog while nothing is pending", () => {
    useTerritoryCatalog.mockReturnValue(state({ pending: null }));
    render(<TerritoryCatalogScreen />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("says the catalog is empty rather than blaming the filter", () => {
    useTerritoryCatalog.mockReturnValue(state({ cards: [] }));
    render(<TerritoryCatalogScreen />);
    expect(screen.getByText("No territories yet — upload one to get started.")).toBeInTheDocument();
  });
});
