import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Document } from "@/entities/document";
import type { Panorama } from "@/entities/panorama";
import type { PageParts } from "../model/page-props";
import { viewerState } from "../territory-viewer-page.fixture";
import { TerritoryViewerPage } from "./territory-viewer-page";

// three and its loaders never mount in jsdom; the canvas is a boundary and the
// page's job is only to hand it its props.
vi.mock("@/widgets/viewer-canvas", () => ({
  ViewerCanvas: () => <div data-testid="canvas" />,
  preloadViewer: vi.fn(),
}));

const page = (edit?: (p: PageParts) => PageParts) =>
  render(<TerritoryViewerPage {...viewerState(edit)} />);

const PANORAMA: Panorama = {
  id: 1,
  territorySlug: "refinery-block-c",
  slug: "control-room-north-door",
  title: "Control room, north door",
  sourceBlobHash: "p1",
  position: { x: 4.82, y: 1.7, z: -2.145 },
  yawOffset: 2.4,
  defaultYaw: 0,
  updatedAt: "2026-09-01T00:00:00Z",
};

const DOCUMENT: Document = {
  id: 1,
  territorySlug: "refinery-block-c",
  title: "plan-sheet-03.pdf",
  sourceBlobHash: "d1",
  createdAt: "2026-09-01T00:00:00Z",
};

describe("TerritoryViewerPage", () => {
  it("draws the header, the rail, the strip and the panel", () => {
    page();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Refinery Block C");
    expect(screen.getByRole("toolbar", { name: "Viewer tools" })).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Scene stats" })).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "Overlays" })).toBeInTheDocument();
  });

  it("draws no chrome of its own — the route's shell owns the landmark", () => {
    const { container } = page();
    expect(container.querySelector("main")).toBeNull();
  });

  it("mounts the canvas inside the viewport", () => {
    page();
    expect(screen.getByTestId("canvas")).toBeInTheDocument();
  });

  it("lists the placements on the Placements tab, anchored for the tour", () => {
    const { container } = page();
    expect(screen.getByRole("list", { name: "Objects" })).toBeInTheDocument();
    expect(container.querySelector('[data-tour="objects-list"]')).toContainElement(
      screen.getByRole("list", { name: "Objects" }),
    );
  });

  // Both anchors have to be *inside* the aside: the panel's own root is a
  // static, zero-height block, so an attribute on it measures nothing and the
  // tour's halo lights empty space at the bottom of the window.
  it("anchors the Overlays step on the tabs strip, inside the panel", () => {
    const { container } = page();
    const anchor = container.querySelector('[data-tour="overlays-tabs"]');
    expect(anchor).toContainElement(screen.getByRole("tablist"));
    expect(screen.getByRole("complementary", { name: "Overlays" })).toContainElement(
      anchor as HTMLElement,
    );
  });

  it("prints the territory's facts on the View tab", () => {
    page((p) => ({ ...p, panel: { tab: "view", collapsed: false } }));
    expect(screen.getByText("refinery-block-c")).toBeInTheDocument();
    expect(screen.getByText("1 284 210")).toBeInTheDocument();
  });

  it("folds the panel away to its rail", () => {
    page((p) => ({ ...p, panel: { tab: "placements", collapsed: true } }));
    expect(screen.queryByRole("complementary", { name: "Overlays" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Expand Overlays panel" })).toBeInTheDocument();
  });

  it("opens the model picker as a dialog", () => {
    page((p) => ({ ...p, view: { ...p.view, pickerOpen: true } }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Add objects to Refinery Block C");
  });

  it("keeps the picker shut otherwise", () => {
    page();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("drops the panel and shows the card when the mesh failed", () => {
    page((p) => ({
      ...p,
      view: {
        ...p.view,
        report: { shown: null, target: 1, percent: null, progressText: null, failure: { hash: "h1", status: 502 } },
        error: { lod: 1, status: 502, file: "refinery-block-c-lod1.glb", coarser: null },
      },
    }));
    expect(screen.queryByRole("complementary", { name: "Overlays" })).not.toBeInTheDocument();
    expect(screen.getByText("The territory mesh could not be loaded")).toBeInTheDocument();
  });

  it("stands the skeleton card in while nothing is on screen yet", () => {
    page((p) => ({
      ...p,
      view: { ...p.view, report: { ...p.view.report, shown: null } },
    }));
    expect(screen.getByText("Loading interface…")).toBeInTheDocument();
  });

  it("takes the skeleton away once a level has arrived", () => {
    page();
    expect(screen.queryByText("Loading interface…")).not.toBeInTheDocument();
  });

  it("draws the View tab's panorama and document sections", () => {
    page((p) => ({
      ...p,
      panel: { tab: "view", collapsed: false },
      panoramas: { ...p.panoramas, list: [PANORAMA] },
      documents: { ...p.documents, list: [DOCUMENT] },
    }));
    expect(screen.getByText("Control room, north door")).toBeInTheDocument();
    expect(screen.getByText("plan-sheet-03.pdf")).toBeInTheDocument();
  });

  it("lays the open document over the viewport", () => {
    page((p) => ({ ...p, documents: { ...p.documents, list: [DOCUMENT], active: DOCUMENT } }));
    expect(screen.getByRole("dialog", { name: "plan-sheet-03.pdf" })).toBeInTheDocument();
  });

  it("opens the one upload dialog both overlays share", () => {
    page((p) => ({
      ...p,
      panoramas: { ...p.panoramas, upload: { ...p.panoramas.upload, open: true } },
    }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Add a panorama to Refinery Block C");
  });

  it("runs the panorama tour over everything else", () => {
    page((p) => ({
      ...p,
      panoramaTour: {
        ...p.panoramaTour,
        active: true,
        step: { id: "panoramas", title: "Every capture anchored here", body: "Step inside one." },
        stepIndex: 0,
      },
    }));
    expect(screen.getByRole("dialog", { name: /Tour step 1/ })).toBeInTheDocument();
  });

  it("runs the guided tour over everything else", () => {
    page((p) => ({
      ...p,
      tour: { ...p.tour, active: true, step: { id: "reset-camera", title: "Reset the camera", body: "Frame it again." }, stepIndex: 2 },
    }));
    expect(screen.getByRole("dialog", { name: /Tour step 3/ })).toBeInTheDocument();
  });
});
