import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ContentCard } from "./content-card";
import type { ContentItem } from "../model/content-item";

const item = (over: Partial<ContentItem> = {}): ContentItem => ({
  kind: "territory",
  slug: "north-ridge-pad",
  title: "North Ridge Pad",
  status: "ready",
  size: "412 MB",
  lods: "0-2",
  updated: "31.08",
  ...over,
});

describe("ContentCard", () => {
  it("shows the title, slug and artifact facts", () => {
    render(<ContentCard item={item()} />);
    expect(screen.getByText("North Ridge Pad")).toBeInTheDocument();
    expect(screen.getByText("north-ridge-pad")).toBeInTheDocument();
    expect(screen.getByText("412 MB")).toBeInTheDocument();
    expect(screen.getByText("LOD 0-2")).toBeInTheDocument();
    expect(screen.getByText("territory")).toBeInTheDocument();
  });

  it("links a ready item to its own section", () => {
    const { unmount } = render(<ContentCard item={item()} />);
    expect(screen.getByRole("link", { name: "Open →" })).toHaveAttribute(
      "href",
      "/territories/north-ridge-pad",
    );
    unmount();

    render(<ContentCard item={item({ kind: "model", slug: "pump-jack-unit" })} />);
    expect(screen.getByRole("link", { name: "Open →" })).toHaveAttribute(
      "href",
      "/models/pump-jack-unit",
    );
  });

  it("offers no link while converting, and says which it is", () => {
    render(<ContentCard item={item({ status: "converting", progress: 62, stage: "Compressing textures…" })} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText("Converting")).toBeInTheDocument();
    expect(screen.getByText("Compressing textures…")).toBeInTheDocument();
  });

  it("reports conversion progress", () => {
    render(<ContentCard item={item({ status: "converting", progress: 62 })} />);
    expect(
      screen.getByRole("progressbar", { name: "North Ridge Pad conversion" }),
    ).toHaveAttribute("aria-valuenow", "62");
  });

  it("runs indeterminate before the worker reports progress", () => {
    render(<ContentCard item={item({ status: "converting" })} />);
    expect(screen.getByRole("progressbar")).not.toHaveAttribute("aria-valuenow");
  });

  it("says a failed item is unavailable rather than offering a dead link", () => {
    render(<ContentCard item={item({ status: "failed" })} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText("Unavailable")).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("outlines a converting card in the warning tone", () => {
    const { container, rerender } = render(<ContentCard item={item()} />);
    expect(container.firstElementChild!.className).toContain("border-line");

    rerender(<ContentCard item={item({ status: "converting" })} />);
    expect(container.firstElementChild!.className).toContain("border-warn");
  });

  it("shows a thumbnail when there is one, and the cube glyph otherwise", () => {
    const { unmount } = render(<ContentCard item={item()} />);
    expect(document.querySelector("img")).toBeNull();
    expect(document.querySelector("svg")).toBeInTheDocument();
    unmount();

    render(<ContentCard item={item({ thumbnailUrl: "/api/assets/deadbeef" })} />);
    expect(document.querySelector("img")).toHaveAttribute("alt", "");
  });

  it("names its row actions after the item they act on", async () => {
    const onReplace = vi.fn();
    const onDelete = vi.fn();
    render(<ContentCard item={item()} onReplace={onReplace} onDelete={onDelete} />);

    await userEvent.click(screen.getByRole("button", { name: "Replace source of North Ridge Pad" }));
    await userEvent.click(screen.getByRole("button", { name: "Delete North Ridge Pad" }));
    expect(onReplace).toHaveBeenCalledOnce();
    expect(onDelete).toHaveBeenCalledOnce();
  });

  it("offers only the actions the caller allows", () => {
    render(<ContentCard item={item()} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
