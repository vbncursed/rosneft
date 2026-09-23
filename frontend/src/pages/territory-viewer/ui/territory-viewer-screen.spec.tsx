import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { TerritoryViewerState } from "../model/use-territory-viewer";
import { viewerState } from "../territory-viewer-page.fixture";
import { TerritoryViewerScreen } from "./territory-viewer-screen";

const { useTerritoryViewer, useSceneSeeded, useParams } = vi.hoisted(() => ({
  useTerritoryViewer: vi.fn(),
  useSceneSeeded: vi.fn(),
  useParams: vi.fn(),
}));
vi.mock("../model/use-territory-viewer", () => ({ useTerritoryViewer }));
vi.mock("../model/use-scene-seeded", () => ({ useSceneSeeded }));
vi.mock("@tanstack/react-router", () => ({ useParams: () => useParams() }));
vi.mock("@/features/edit-entity", () => ({
  EditDetailsDialog: ({ title }: { title: string }) => <div role="dialog" aria-label={`Edit ${title}`} />,
}));
vi.mock("@/widgets/viewer-canvas", () => ({
  ViewerCanvas: () => <div data-testid="canvas" />,
  preloadViewer: vi.fn(),
}));

const READY = (): TerritoryViewerState => ({ status: "ready", ...viewerState() });

describe("TerritoryViewerScreen", () => {
  it("hands the slug from the URL to the hook", () => {
    useParams.mockReturnValue({ slug: "refinery-block-c" });
    useSceneSeeded.mockReturnValue(true);
    useTerritoryViewer.mockReturnValue(READY());
    render(<TerritoryViewerScreen />);
    expect(useTerritoryViewer).toHaveBeenCalledWith("refinery-block-c");
  });

  it("stands the loading card in while nothing has answered", () => {
    useParams.mockReturnValue({ slug: "t" });
    useSceneSeeded.mockReturnValue(false);
    useTerritoryViewer.mockReturnValue({ status: "loading" });
    render(<TerritoryViewerScreen />);
    expect(screen.getByRole("status", { name: "Loading the viewer" })).toBeInTheDocument();
    expect(screen.getByText("Loading interface…")).toBeInTheDocument();
  });

  it("offers the way back when the territory is not there", () => {
    useParams.mockReturnValue({ slug: "t" });
    useSceneSeeded.mockReturnValue(false);
    useTerritoryViewer.mockReturnValue({ status: "missing" });
    render(<TerritoryViewerScreen />);
    expect(screen.getByText("Territory not found")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "← Territory catalog" })).toHaveAttribute(
      "href",
      "/territories",
    );
  });

  it("says why when the scene could not be read", () => {
    useParams.mockReturnValue({ slug: "t" });
    useSceneSeeded.mockReturnValue(false);
    useTerritoryViewer.mockReturnValue({ status: "unavailable", error: "catalog is down" });
    render(<TerritoryViewerScreen />);
    expect(screen.getByRole("alert")).toHaveTextContent("catalog is down");
  });

  it("draws the page once the scene is in hand", () => {
    useParams.mockReturnValue({ slug: "refinery-block-c" });
    useSceneSeeded.mockReturnValue(true);
    useTerritoryViewer.mockReturnValue(READY());
    render(<TerritoryViewerScreen />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Refinery Block C");
  });

  // The editor seeds its list once, at mount, from the bundle the hook holds
  // then. Keying on whether the bundle is in hand remounts it exactly once —
  // when the bundle first lands — so a cold page does not seed an empty list
  // and keep it.
  it("remounts the body when the bundle arrives, and not again afterwards", () => {
    useParams.mockReturnValue({ slug: "t" });
    useSceneSeeded.mockReturnValue(false);
    useTerritoryViewer.mockReturnValue({ status: "loading" });
    const { rerender, container } = render(<TerritoryViewerScreen />);
    const before = container.firstElementChild;

    useSceneSeeded.mockReturnValue(true);
    useTerritoryViewer.mockReturnValue(READY());
    rerender(<TerritoryViewerScreen />);
    const after = container.firstElementChild;
    expect(after).not.toBe(before);

    rerender(<TerritoryViewerScreen />);
    expect(container.firstElementChild).toBe(after);
  });

  it("opens the details editor from the header", async () => {
    useParams.mockReturnValue({ slug: "refinery-block-c" });
    useSceneSeeded.mockReturnValue(true);
    useTerritoryViewer.mockReturnValue(READY());
    render(<TerritoryViewerScreen />);
    await userEvent.click(screen.getByRole("button", { name: "Edit details" }));
    expect(screen.getByRole("dialog", { name: "Edit Refinery Block C" })).toBeInTheDocument();
  });
});
