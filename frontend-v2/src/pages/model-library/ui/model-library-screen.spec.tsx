import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ModelCardModel } from "../model/catalog";
import type { ModelLibraryState } from "../model/use-model-library";
import { ModelLibraryScreen } from "./model-library-screen";

const { useModelLibrary, navigate } = vi.hoisted(() => ({
  useModelLibrary: vi.fn(),
  navigate: vi.fn(),
}));
vi.mock("../model/use-model-library", () => ({ useModelLibrary }));
// A stand-in for the router context: the screen is rendered on its own.
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => navigate }));

const M1: ModelCardModel = {
  slug: "m-1",
  title: "M 1",
  status: "ready",
  thumbnailUrl: "/api/assets/x",
  usageCount: 6,
  size: "38 MB",
  lods: "LOD 0-2",
  trailing: { label: "in 6 territories", tone: "accent" },
};
const M2: ModelCardModel = {
  slug: "m-2",
  title: "M 2",
  status: "ready",
  thumbnailUrl: null,
  usageCount: 0,
  size: "—",
  lods: "—",
  trailing: { label: "unused", tone: "muted" },
};

const state = (over: Partial<ModelLibraryState> = {}): ModelLibraryState => ({
  status: "ready",
  error: null,
  cards: [M1, M2],
  tab: "all",
  setTab: vi.fn(),
  query: "",
  setQuery: vi.fn(),
  canUpload: true,
  canDelete: true,
  pending: null,
  ask: vi.fn(),
  confirm: vi.fn(),
  dismiss: vi.fn(),
  busy: false,
  ...over,
});

beforeEach(() => {
  useModelLibrary.mockReset();
  navigate.mockReset();
});

describe("ModelLibraryScreen", () => {
  it("shows skeletons while loading and the gateway's sentence when unavailable", () => {
    useModelLibrary.mockReturnValue(state({ status: "loading", cards: null }));
    const { unmount } = render(<ModelLibraryScreen />);
    expect(screen.getByRole("status", { name: "Loading models" })).toBeInTheDocument();
    unmount();
    useModelLibrary.mockReturnValue(
      state({ status: "unavailable", cards: null, error: "You don't have permission to do this" }),
    );
    render(<ModelLibraryScreen />);
    expect(screen.getByRole("alert")).toHaveTextContent("You don't have permission to do this");
  });

  it("counts every card regardless of the current tab or query", () => {
    useModelLibrary.mockReturnValue(state({ tab: "inUse", query: "m" }));
    render(<ModelLibraryScreen />);
    expect(screen.getByRole("radio", { name: "All · 2" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "In use · 1" })).toBeInTheDocument();
  });

  it("narrows the cards through the pure filter", () => {
    useModelLibrary.mockReturnValue(state({ tab: "inUse" }));
    render(<ModelLibraryScreen />);
    expect(screen.getByRole("article", { name: "M 1" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "M 2" })).not.toBeInTheDocument();
  });

  it("navigates to the model page rather than leaving the SPA", async () => {
    useModelLibrary.mockReturnValue(state());
    render(<ModelLibraryScreen />);
    await userEvent.click(screen.getByRole("article", { name: "M 1" }));
    expect(navigate).toHaveBeenCalledWith({ href: "/models/m-1" });
  });

  it("navigates to the v2 upload route rather than leaving the SPA", async () => {
    useModelLibrary.mockReturnValue(state());
    render(<ModelLibraryScreen />);
    await userEvent.click(screen.getByRole("button", { name: "+ Upload" }));
    expect(navigate).toHaveBeenCalledWith({ to: "/models/new" });
  });

  it("asks before deleting and hands the slug to the container", async () => {
    const ask = vi.fn();
    useModelLibrary.mockReturnValue(state({ ask }));
    render(<ModelLibraryScreen />);
    await userEvent.click(screen.getByRole("button", { name: "Delete M 2" }));
    expect(ask).toHaveBeenCalledWith("m-2");
  });

  it("confirms the delete dialog with the pending card's exact copy", async () => {
    const confirm = vi.fn();
    useModelLibrary.mockReturnValue(state({ pending: M2, confirm }));
    render(<ModelLibraryScreen />);
    const dialog = screen.getByRole("dialog", { name: "Delete M 2?" });
    expect(dialog).toHaveTextContent("This cannot be undone.");
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(confirm).toHaveBeenCalled();
  });

  it("draws no dialog while nothing is pending", () => {
    useModelLibrary.mockReturnValue(state({ pending: null }));
    render(<ModelLibraryScreen />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("says the library is empty rather than blaming the filter", () => {
    useModelLibrary.mockReturnValue(state({ cards: [] }));
    render(<ModelLibraryScreen />);
    expect(screen.getByText("No models yet — upload one to get started.")).toBeInTheDocument();
  });
});
