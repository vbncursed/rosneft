import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Document } from "@/entities/document";
import type { PipGeometry } from "@/features/document-view";
import { DocumentWindow, type DocumentWindowProps } from "./document-window";

const FILE = "plan-sheet-03.pdf";

const doc: Document = {
  id: 1,
  territorySlug: "refinery-block-c",
  title: FILE,
  sourceBlobHash: "h",
  createdAt: "2026-09-01T00:00:00Z",
};

const GEO: PipGeometry = { x: 10, y: 20, w: 560, h: 400 };

const pip = (dragging = false) => ({ geo: GEO, dragging, startMove: vi.fn(), startResize: vi.fn() });

const props = (over: Partial<DocumentWindowProps> = {}): DocumentWindowProps => ({
  document: doc,
  window: "pip",
  canDelete: true,
  pip: pip(),
  onWindow: vi.fn(),
  onDelete: vi.fn(),
  onExit: vi.fn(),
  frameSrc: "about:blank",
  ...over,
});

describe("DocumentWindow", () => {
  it("points the pdf.js frame at the document's own asset by default", () => {
    render(<DocumentWindow {...props({ frameSrc: undefined })} />);
    expect(screen.getByTitle(FILE)).toHaveAttribute(
      "src",
      "/pdfjs/web/viewer.html?file=%2Fapi%2Fassets%2Fh",
    );
  });

  it("is a pip window named by the file, with the handle, the grip, and its actions", async () => {
    const onWindow = vi.fn();
    const onExit = vi.fn();
    render(<DocumentWindow {...props({ onWindow, onExit })} />);

    expect(screen.getByRole("dialog", { name: FILE })).toBeInTheDocument();
    expect(screen.getByTitle("Drag to move")).toBeInTheDocument();
    expect(screen.getByTitle("Resize")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: `Expand ${FILE}` }));
    expect(onWindow).toHaveBeenCalledWith("expanded");

    await userEvent.click(screen.getByRole("button", { name: `Hide ${FILE}` }));
    expect(onWindow).toHaveBeenCalledWith("collapsed");

    await userEvent.click(screen.getByRole("button", { name: "Exit document overlay" }));
    expect(onExit).toHaveBeenCalledOnce();
  });

  it("offers Delete with canDelete", () => {
    render(<DocumentWindow {...props()} />);
    expect(screen.getByRole("button", { name: `Delete ${FILE}` })).toBeInTheDocument();
  });

  it("hides Delete without canDelete", () => {
    render(<DocumentWindow {...props({ canDelete: false })} />);
    expect(screen.queryByRole("button", { name: `Delete ${FILE}` })).toBeNull();
  });

  it("expands to fill the viewport: Restore instead of Expand, no Hide, no handle", () => {
    render(<DocumentWindow {...props({ window: "expanded" })} />);

    expect(screen.queryByTitle("Drag to move")).toBeNull();
    expect(screen.getByRole("button", { name: `Restore ${FILE} to a window` })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: `Expand ${FILE}` })).toBeNull();
    expect(screen.queryByRole("button", { name: `Hide ${FILE}` })).toBeNull();
  });

  it("collapses to a pill without unmounting the frame", async () => {
    const onWindow = vi.fn();
    render(<DocumentWindow {...props({ window: "collapsed", onWindow })} />);

    const iframe = screen.getByTitle(FILE);
    expect(iframe).toBeInTheDocument();
    expect(iframe).not.toBeVisible();

    const showButton = screen.getByRole("button", { name: "Show" });
    expect(within(showButton.parentElement as HTMLElement).getByText(FILE)).toBeInTheDocument();

    await userEvent.click(showButton);
    expect(onWindow).toHaveBeenCalledWith("pip");
  });

  it("confirms before deleting, and only the confirm calls onDelete", async () => {
    const onDelete = vi.fn();
    render(<DocumentWindow {...props({ onDelete })} />);

    await userEvent.click(screen.getByRole("button", { name: `Delete ${FILE}` }));
    const dialog = screen.getByRole("dialog", { name: `Delete ${FILE}?` });
    expect(onDelete).not.toHaveBeenCalled();

    await userEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    expect(onDelete).toHaveBeenCalledOnce();
  });

  it("shields the body while the pip window is dragging", () => {
    const { rerender } = render(<DocumentWindow {...props()} />);
    expect(screen.queryByTestId("drag-shield")).toBeNull();

    rerender(<DocumentWindow {...props({ pip: pip(true) })} />);
    expect(screen.getByTestId("drag-shield")).toBeInTheDocument();
  });
});
