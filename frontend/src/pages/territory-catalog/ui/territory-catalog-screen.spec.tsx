import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TerritoryCardModel } from "@/entities/territory";
import { resetOfflineStore } from "@/features/offline-save";
import type { DesktopBridge } from "@/shared/lib/desktop";
import type { TerritoryCatalogState } from "../model/use-territory-catalog";
import { TerritoryCatalogScreen } from "./territory-catalog-screen";

const { useTerritoryCatalog, navigate, online } = vi.hoisted(() => ({
  useTerritoryCatalog: vi.fn(),
  navigate: vi.fn(),
  online: { value: true },
}));
vi.mock("@/shared/lib/use-online", () => ({ useOnline: () => online.value }));
vi.mock("../model/use-territory-catalog", () => ({ useTerritoryCatalog }));
// A stand-in for the router context: the screen is rendered on its own.
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => navigate }));
vi.mock("@/features/edit-entity", () => ({
  EditDetailsDialog: ({ title }: { title: string }) => <div role="dialog" aria-label={`Edit ${title}`} />,
}));

const T1: TerritoryCardModel = {
  slug: "t-1",
  title: "T 1",
  status: "ready",
  chips: [{ label: "3 placements", tone: "plain" }],
  trailing: { label: "Open →", tone: "accent" },
  panorama: false,
};
const T2: TerritoryCardModel = {
  slug: "t-2",
  title: "T 2",
  status: "pending",
  chips: [
    { label: "—", tone: "plain" },
    { label: "—", tone: "plain" },
  ],
  trailing: { label: "pending", tone: "muted" },
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
  navigate.mockReset();
});

afterEach(() => {
  online.value = true;
  delete window.desktop;
  resetOfflineStore();
});

describe("TerritoryCatalogScreen", () => {
  it("shows skeletons while loading and the gateway's sentence when unavailable", () => {
    useTerritoryCatalog.mockReturnValue(state({ status: "loading", cards: null }));
    const { unmount } = render(<TerritoryCatalogScreen />);
    expect(screen.getByRole("status", { name: "Loading territories" })).toBeInTheDocument();
    // The placeholder is shaped like the catalog screen it stands in for.
    expect(
      screen.getByRole("status", { name: "Loading territories" }).querySelector('[style*="height: 280px"]'),
    ).not.toBeNull();
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
  });

  it("navigates to the replace form rather than leaving the SPA", async () => {
    useTerritoryCatalog.mockReturnValue(state());
    render(<TerritoryCatalogScreen />);
    await userEvent.click(screen.getByRole("button", { name: "Replace source of T 1" }));
    expect(navigate).toHaveBeenCalledWith({ href: "/territories/t-1/replace" });
  });

  it("navigates to the v2 upload route rather than leaving the SPA", async () => {
    useTerritoryCatalog.mockReturnValue(state());
    render(<TerritoryCatalogScreen />);
    await userEvent.click(screen.getAllByRole("button", { name: "Upload territory" })[0]);
    expect(navigate).toHaveBeenCalledWith({ to: "/territories/new" });
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
    expect(dialog).toHaveTextContent("Its placements, panoramas and documents go with it. This cannot be undone.");
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

  it("opens the details editor for the card whose pencil was pressed", async () => {
    useTerritoryCatalog.mockReturnValue(state());
    render(<TerritoryCatalogScreen />);
    await userEvent.click(screen.getByRole("button", { name: "Edit details of T 1" }));
    expect(screen.getByRole("dialog", { name: "Edit T 1" })).toBeInTheDocument();
  });

  it("dims a territory that was never saved while the shell is offline, and says to reconnect on the unsaved one", async () => {
    const saved = { slug: "t-1", title: "T 1", bytes: 10, savedAt: "t", syncedAt: "t" };
    window.desktop = {
      passkeys: false,
      offline: {
        list: async () => [saved],
        save: async () => {},
        cancel: async () => {},
        remove: async () => {},
        onProgress: () => () => {},
      },
    } as unknown as DesktopBridge;
    online.value = false;
    useTerritoryCatalog.mockReturnValue(state());
    render(<TerritoryCatalogScreen />);
    expect(await screen.findByRole("button", { name: "T 1 — Available offline · 10 B" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reconnect to save T 2" })).toBeInTheDocument();
    expect(screen.getAllByText("Unavailable offline")).toHaveLength(1);
    expect(screen.queryByText("Open →", { selector: 'article[aria-label="T 2"] *' })).toBeNull();
  });

  it("draws no offline control in a browser", () => {
    useTerritoryCatalog.mockReturnValue(state());
    render(<TerritoryCatalogScreen />);
    expect(screen.queryByRole("button", { name: /offline/ })).toBeNull();
  });
  it("does not call anything unavailable before the saved list has answered", async () => {
    let answer: (v: unknown[]) => void = () => {};
    window.desktop = {
      passkeys: false,
      offline: {
        list: () => new Promise((r) => (answer = r)),
        save: async () => {},
        cancel: async () => {},
        remove: async () => {},
        onProgress: () => () => {},
      },
    } as unknown as DesktopBridge;
    online.value = false;
    useTerritoryCatalog.mockReturnValue(state());
    render(<TerritoryCatalogScreen />);
    expect(screen.queryByText("Unavailable offline")).toBeNull();
    await act(async () => answer([]));
    expect(screen.getAllByText("Unavailable offline")).toHaveLength(2);
  });
});
