import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Document } from "@/entities/document";
import type { ViewerOverlaysProps } from "../model/page-props";
import { ViewerOverlays } from "./viewer-overlays";

const FILE = "plan-sheet-03.pdf";

const DOC: Document = {
  id: 1,
  territorySlug: "refinery-block-c",
  title: FILE,
  sourceBlobHash: "h",
  createdAt: "2026-09-01T00:00:00Z",
};

const documentWindow = (over: Partial<ViewerOverlaysProps["document"]> = {}) => ({
  document: DOC,
  window: "pip" as const,
  canDelete: true,
  pip: {
    geo: { x: 866, y: 242, w: 560, h: 400 },
    dragging: false,
    startMove: vi.fn(),
    startResize: vi.fn(),
  },
  onWindow: vi.fn(),
  onDelete: vi.fn(),
  onExit: vi.fn(),
  frameSrc: "about:blank",
  ...over,
});

const STRIP = {
  items: ["36.0 × 24.0 × 8.5 m", "1 284 210 vertices", "612 480 faces", "LOD 1 active"],
  tone: "neutral" as const,
  accentLast: false,
};

const props = (over: Partial<ViewerOverlaysProps> = {}): ViewerOverlaysProps => ({
  tools: [
    { key: "reset", state: "active" },
    { key: "measure", state: "idle" },
    { key: "add", state: "idle" },
    { key: "panoramas", state: "idle" },
    { key: "documents", state: "idle" },
    { key: "tour", state: "idle" },
  ],
  onReset: vi.fn(),
  onMeasure: vi.fn(),
  onAdd: vi.fn(),
  onPanoramas: vi.fn(),
  onDocuments: vi.fn(),
  onReplayTour: vi.fn(),
  chip: { text: "orbit · drag to rotate" },
  loading: null,
  measuring: null,
  switcher: { levels: [0, 1, 2], target: 1, shown: 1, onChange: vi.fn() },
  strip: STRIP,
  hints: false,
  error: null,
  switchTo3d: null,
  document: null,
  documentLayerRef: { current: null },
  ...over,
});

describe("ViewerOverlays · the tool rail", () => {
  it("names every tile and marks the active one", () => {
    render(<ViewerOverlays {...props()} />);
    const rail = screen.getByRole("toolbar", { name: "Viewer tools" });
    expect([...rail.querySelectorAll("button")].map((b) => b.getAttribute("aria-label"))).toEqual([
      "Reset camera",
      "Measure (M)",
      "Add objects",
      "Panoramas",
      "Documents",
      "Replay guided tour",
    ]);
    // The lit tile is not a pressed toggle unless it names a mode.
    expect(screen.getByRole("button", { name: "Reset camera" })).not.toHaveAttribute("aria-pressed");
    expect(screen.getByRole("button", { name: "Measure (M)" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("marks the two overlay tiles as the modes they are", () => {
    render(
      <ViewerOverlays
        {...props({
          tools: props().tools.map((t) =>
            t.key === "panoramas" ? { ...t, state: "active" as const } : t,
          ),
        })}
      />,
    );
    expect(screen.getByRole("button", { name: "Panoramas" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Documents" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("reveals each overlay section from its own tile", async () => {
    const onPanoramas = vi.fn();
    const onDocuments = vi.fn();
    render(<ViewerOverlays {...props({ onPanoramas, onDocuments })} />);
    await userEvent.click(screen.getByRole("button", { name: "Panoramas" }));
    await userEvent.click(screen.getByRole("button", { name: "Documents" }));
    expect(onPanoramas).toHaveBeenCalledOnce();
    expect(onDocuments).toHaveBeenCalledOnce();
  });

  it("anchors the three tour targets on the tiles themselves", () => {
    const { container } = render(<ViewerOverlays {...props()} />);
    for (const [anchor, name] of [
      ["reset-camera", "Reset camera"],
      ["measure", "Measure (M)"],
      ["add-object", "Add objects"],
    ] as const) {
      expect(container.querySelector(`[data-tour="${anchor}"]`)).toBe(
        screen.getByRole("button", { name }),
      );
    }
  });

  it("drops the Add tile for a reader who cannot create", () => {
    render(<ViewerOverlays {...props({ tools: props().tools.filter((t) => t.key !== "add") })} />);
    expect(screen.queryByRole("button", { name: "Add objects" })).not.toBeInTheDocument();
  });

  it("calls the handler the tile stands for", async () => {
    const onMeasure = vi.fn();
    render(<ViewerOverlays {...props({ onMeasure })} />);
    await userEvent.click(screen.getByRole("button", { name: "Measure (M)" }));
    expect(onMeasure).toHaveBeenCalledOnce();
  });

  it("does not fire an inert tile", async () => {
    const onReset = vi.fn();
    render(
      <ViewerOverlays
        {...props({ onReset, tools: props().tools.map((t) => ({ ...t, state: "inert" as const })) })}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Reset camera" }));
    expect(onReset).not.toHaveBeenCalled();
  });
});

describe("ViewerOverlays · what the pointer is doing", () => {
  it("says what a drag does while orbiting", () => {
    render(<ViewerOverlays {...props()} />);
    expect(screen.getByText("orbit · drag to rotate")).toBeInTheDocument();
  });

  it("replaces the chip with the spinner and the download readout", () => {
    render(
      <ViewerOverlays
        {...props({
          chip: null,
          loading: { chip: "coarse LOD 2 shown · LOD 0 62% · 6.1 / 9.8 MB", percent: 62, target: 0 },
        })}
      />,
    );
    expect(screen.getByText("Loading model")).toBeInTheDocument();
    expect(screen.getByText("coarse LOD 2 shown · LOD 0 62% · 6.1 / 9.8 MB")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Loading LOD 0" })).toHaveAttribute(
      "aria-valuenow",
      "62",
    );
    // Fixed-width digits: the chip does not breathe with every chunk.
    expect(screen.getByText("coarse LOD 2 shown · LOD 0 62% · 6.1 / 9.8 MB")).toHaveClass("tabular-nums");
  });

  it("fills the progress line by scale, linearly, and holds it still under reduced motion", () => {
    render(
      <ViewerOverlays
        {...props({ chip: null, loading: { chip: "LOD 0 62%", percent: 62, target: 0 } })}
      />,
    );
    const fill = screen.getByRole("progressbar", { name: "Loading LOD 0" })
      .firstElementChild as HTMLElement;
    expect(fill.style.transform).toBe("scaleX(0.62)");
    expect(fill.style.width).toBe("");
    expect(fill).toHaveClass("origin-left", "ease-linear", "motion-reduce:transition-none");
  });

  it("draws no progress line when nothing is downloading", () => {
    render(<ViewerOverlays {...props()} />);
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });
});

describe("ViewerOverlays · measuring", () => {
  const measuring = (over = {}) =>
    props({
      chip: { text: "measure · 2 segments · 20.55 m total" },
      measuring: {
        onClear: vi.fn(),
        onCloseChain: vi.fn(),
        canClear: true,
        canClose: true,
        ...over,
      },
    });

  it("offers Clear and Close, and the hint bar that explains the clicks", () => {
    render(<ViewerOverlays {...measuring()} />);
    expect(screen.getByRole("button", { name: "Clear" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Close measurement chain" })).toBeEnabled();
    const hint = screen.getByRole("note", { name: "Measure tool" });
    expect(hint).toHaveTextContent("Click two points");
    expect(hint).toHaveTextContent("Shift+click removes the chain");
    expect(hint).toHaveTextContent("Esc exits");
  });

  it("disables Close with no chain open and Clear with nothing measured", () => {
    render(<ViewerOverlays {...measuring({ canClear: false, canClose: false })} />);
    expect(screen.getByRole("button", { name: "Clear" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Close measurement chain" })).toBeDisabled();
  });

  it("keeps the hint bar off outside measure mode", () => {
    render(<ViewerOverlays {...props()} />);
    expect(screen.queryByRole("note", { name: "Measure tool" })).not.toBeInTheDocument();
  });
});

describe("ViewerOverlays · the strip, the switcher and the hints", () => {
  it("prints the scene's facts", () => {
    render(<ViewerOverlays {...props()} />);
    const strip = screen.getByRole("status", { name: "Scene stats" });
    expect(strip).toHaveTextContent("1 284 210 vertices");
    expect(strip).toHaveTextContent("LOD 1 active");
  });

  it("reports rather than alerts when the strip states an absence", () => {
    render(
      <ViewerOverlays
        {...props({ strip: { items: ["no geometry loaded"], tone: "bad", accentLast: false } })}
      />,
    );
    expect(screen.getByRole("status", { name: "Scene stats" })).toBeInTheDocument();
    // The error card is the page's one alert; the strip is context for it.
    expect(screen.queryAllByRole("alert")).toHaveLength(0);
  });

  it("offers every converted level and marks the one asked for", () => {
    render(<ViewerOverlays {...props()} />);
    const group = screen.getByRole("radiogroup", { name: "Level of detail" });
    expect(group.querySelectorAll("button")).toHaveLength(3);
    expect(screen.getByRole("radio", { name: "LOD 1" })).toHaveAttribute("aria-checked", "true");
  });

  // N23: folding the panel moves the switcher's edge by 276px. The browser
  // tweens the computed `right` (the variable itself flips in one step); the
  // floating document layer does not follow — its ResizeObserver would re-clamp
  // the window on every frame.
  it("slides the switcher and the hint bar to the panel's new edge, not the document layer", () => {
    render(
      <ViewerOverlays
        {...props({
          document: documentWindow(),
          measuring: { onClear: vi.fn(), onCloseChain: vi.fn(), canClear: true, canClose: true },
        })}
      />,
    );
    const moving = ["transition-[right]", "duration-200", "ease-out", "motion-reduce:transition-none"];
    expect(screen.getByRole("radiogroup")).toHaveClass(...moving);
    expect(screen.getByRole("note", { name: "Measure tool" })).toHaveClass(...moving);
    expect(screen.getByTestId("document-layer")).not.toHaveClass("transition-[right]");
  });

  it("draws no switcher when the page gave none", () => {
    render(<ViewerOverlays {...props({ switcher: null })} />);
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
  });

  it("shows the two keycap hints only when the page asks for them", () => {
    const { rerender } = render(<ViewerOverlays {...props()} />);
    expect(screen.queryByRole("note", { name: "Keyboard hints" })).not.toBeInTheDocument();
    rerender(<ViewerOverlays {...props({ hints: true })} />);
    // Exact text: a substring match passed while the Esc keycap and its label
    // both said "Esc", so the chip read "Esc Esc exit / deselect".
    const hints = screen.getByRole("note", { name: "Keyboard hints" });
    expect([...hints.children].map((c) => c.textContent)).toEqual([
      "Mmeasure",
      "Escexit / deselect",
    ]);
  });
});

describe("ViewerOverlays · the error card", () => {
  it("centres the card over the viewport when the mesh failed", () => {
    render(
      <ViewerOverlays
        {...props({
          chip: null,
          switcher: null,
          error: {
            copy: {
              title: "The territory mesh could not be loaded",
              body: "Storage returned 502 for the LOD 1 mesh.",
              footer: "refinery-block-c-lod1.glb · last attempt 14:22",
              coarseLabel: null,
            },
            onRetry: vi.fn(),
            onCoarse: null,
          },
        })}
      />,
    );
    expect(screen.getByText("The territory mesh could not be loaded")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    // Exactly one: the strip beside it reports, so nothing is announced twice.
    expect(screen.getAllByRole("alert")).toHaveLength(1);
  });
});

describe("ViewerOverlays · inside a panorama", () => {
  it("offers the way back to the 3D scene under the chip", async () => {
    const switchTo3d = vi.fn();
    render(
      <ViewerOverlays
        {...props({ chip: { text: "panorama · drag to look around", kbd: "P" }, switchTo3d })}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Switch to 3D view" }));
    expect(switchTo3d).toHaveBeenCalledOnce();
  });

  it("names the key that cycles the captures on the chip itself", () => {
    render(
      <ViewerOverlays {...props({ chip: { text: "panorama · drag to look around", kbd: "P" } })} />,
    );
    const chip = screen.getByRole("status", { name: "Pointer mode" });
    expect(chip).toHaveTextContent("panorama · drag to look around");
    expect(chip.querySelector("kbd")).toHaveTextContent("P");
  });

  it("draws no way back in the 3D scene", () => {
    render(<ViewerOverlays {...props()} />);
    expect(screen.queryByRole("button", { name: "Switch to 3D view" })).not.toBeInTheDocument();
  });
});

describe("ViewerOverlays · the document window", () => {
  it("mounts the window over the viewport when a document is open", () => {
    render(<ViewerOverlays {...props({ document: documentWindow() })} />);
    expect(screen.getByRole("dialog", { name: FILE })).toBeInTheDocument();
  });

  // The floating layer covers the whole viewport, so anything it swallows is
  // the whole page: the tool rail, the mode chip, the stats strip and the pill
  // all sit under it. jsdom does no hit-testing, so the class that decides it
  // is what the test can read — the Toaster carries the same pair for the same
  // reason.
  it("lets clicks through the floating layer and takes them back for the window", () => {
    render(<ViewerOverlays {...props({ document: documentWindow() })} />);
    expect(screen.getByTestId("document-layer").className).toContain("pointer-events-none");
    expect(screen.getByRole("dialog", { name: FILE }).className).toContain("pointer-events-auto");
  });

  it("lets clicks through the expanded layer too", () => {
    render(<ViewerOverlays {...props({ document: documentWindow({ window: "expanded" }) })} />);
    const layer = screen.getByTestId("document-layer");
    expect(layer.className).toContain("pointer-events-none");
    expect(layer.className).toContain("inset-0");
  });

  it("keeps the pill clickable while the hidden window's layer is still mounted", () => {
    render(<ViewerOverlays {...props({ document: documentWindow({ window: "collapsed" }) })} />);
    expect(screen.getByTestId("document-layer").className).toContain("pointer-events-none");
  });

  it("docks the window inside the viewport, clear of the strip row and the open panel", () => {
    // The area the pip is measured against is this layer: it starts at the
    // container's top (the header is above it, so a window dragged to y = 0
    // keeps its whole title bar on screen), stops 44px short of the bottom for
    // the stats-strip row, and stops at the Overlays panel's edge.
    render(<ViewerOverlays {...props({ document: documentWindow() })} />);
    const layer = screen.getByTestId("document-layer");
    expect(layer.className).toContain("absolute");
    expect(layer.className).toContain("top-0");
    expect(layer.className).toContain("bottom-11");
    expect(layer.className).toContain("right-[calc(var(--overlays-w)+28px)]");
    expect(layer.className).not.toContain("fixed");
  });

  it("draws nothing when no document is open", () => {
    render(<ViewerOverlays {...props()} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("stands exactly one pill while the window is hidden", () => {
    render(<ViewerOverlays {...props({ document: documentWindow({ window: "collapsed" }) })} />);
    // One pill, whoever draws it: the widget's own and a page-drawn one both
    // answer to "Show", and two of them is the bug this counts.
    expect(screen.getAllByRole("button", { name: "Show" })).toHaveLength(1);
  });

  // The strip's width is the scene's, not a constant: `LOD 1 active` and
  // `LOD 1 active · LOD 0 loading` differ by ~96px, so an offset measured off
  // the usual one puts the pill under the strip the moment a level downloads.
  it.each([
    ["short", ["LOD 1 active"]],
    ["long", ["36.0 × 24.0 × 8.5 m", "1 284 210 vertices", "LOD 1 active · LOD 0 loading"]],
  ])("follows the %s strip's own right edge rather than a fixed offset", (_label, items) => {
    render(
      <ViewerOverlays
        {...props({
          strip: { items, tone: "neutral", accentLast: false },
          document: documentWindow({ window: "collapsed" }),
        })}
      />,
    );
    const pill = screen.getByRole("button", { name: "Show" }).closest("div") as HTMLElement;
    const strip = screen.getByRole("status", { name: "Scene stats" });
    // jsdom lays nothing out, so the 14px is asserted as what produces it: one
    // flex row, the strip first and the pill next, `gap-3.5` between them.
    expect(pill.parentElement).toBe(strip.parentElement);
    expect(strip.nextElementSibling).toBe(pill);
    expect(strip.parentElement?.className).toContain("gap-3.5");
    expect(pill.className).not.toContain("absolute");
  });
});
