import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ContentRow } from "./content-row";
import type { ContentItem } from "../model/content-item";

const item = (over: Partial<ContentItem> = {}): ContentItem => ({
  kind: "territory",
  slug: "north-ridge-pad",
  title: "North Ridge Pad",
  status: "ready",
  meta: "north-ridge-pad · upd. 31.08 · 3 placements",
  lods: "LOD 0-2",
  size: "412 MB",
  ...over,
});

describe("ContentRow", () => {
  it("shows the title, its kind, the meta line and the artifact columns", () => {
    render(<ContentRow item={item()} />);
    expect(screen.getByText("North Ridge Pad")).toBeInTheDocument();
    expect(screen.getByText("territory")).toBeInTheDocument();
    expect(screen.getByText(/3 placements/)).toBeInTheDocument();
    expect(screen.getByText("LOD 0-2")).toBeInTheDocument();
    expect(screen.getByText("412 MB")).toBeInTheDocument();
  });

  it("colours the rail by conversion state", () => {
    const { rerender } = render(<ContentRow item={item()} />);
    expect(screen.getByRole("article").className).toContain("border-l-ok");

    rerender(<ContentRow item={item({ status: "converting" })} />);
    expect(screen.getByRole("article").className).toContain("border-l-warn");

    rerender(<ContentRow item={item({ status: "failed" })} />);
    expect(screen.getByRole("article").className).toContain("border-l-bad");
  });

  it("flags a failed item in words, not only by colour", () => {
    render(<ContentRow item={item({ status: "failed", lods: "—", size: "—" })} />);
    expect(screen.getByText("failed")).toBeInTheDocument();
  });

  it("shows conversion progress only while converting", () => {
    const { rerender } = render(<ContentRow item={item()} />);
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();

    rerender(<ContentRow item={item({ status: "converting", progress: 62, stage: "textures" })} />);
    expect(
      screen.getByRole("progressbar", { name: "North Ridge Pad conversion" }),
    ).toHaveAttribute("aria-valuenow", "62");
    expect(screen.getByText("textures")).toBeInTheDocument();
  });

  it("runs indeterminate before the worker reports progress", () => {
    render(<ContentRow item={item({ status: "converting" })} />);
    expect(screen.getByRole("progressbar")).not.toHaveAttribute("aria-valuenow");
  });

  it("dims the LOD column when nothing is converted", () => {
    const { rerender } = render(<ContentRow item={item()} />);
    expect(screen.getByText("LOD 0-2").className).toContain("text-muted");

    rerender(<ContentRow item={item({ lods: "—" })} />);
    expect(screen.getByText("—").className).toContain("text-dim");
  });

  it("distinguishes a territory from a model in the kind pill", () => {
    const { rerender } = render(<ContentRow item={item()} />);
    expect(screen.getByText("territory").className).toContain("text-accent");

    rerender(<ContentRow item={item({ kind: "model" })} />);
    expect(screen.getByText("model").className).toContain("text-muted");
  });

  it("keeps the rail's colour on hover for an unselected row", () => {
    render(<ContentRow item={item({ status: "failed" })} />);
    expect(screen.getByRole("article").className).toContain("hover:border-l-bad/50");
  });

  it("marks the selected row as current and brightens its rail", () => {
    const { rerender } = render(<ContentRow item={item()} />);
    expect(screen.getByRole("article").className).toContain("border-l-ok/50");

    rerender(<ContentRow item={item()} selected />);
    expect(screen.getByRole("article")).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("article").className).not.toContain("border-l-ok/50");
    expect(screen.getByRole("article").className).toContain("border-l-ok");
  });

  it("selects on click", async () => {
    const onSelect = vi.fn();
    render(<ContentRow item={item()} onSelect={onSelect} />);
    await userEvent.click(screen.getByRole("article", { name: "North Ridge Pad" }));
    expect(onSelect).toHaveBeenCalledOnce();
  });

  it("hosts the actions it is given", () => {
    render(<ContentRow item={item()} actions={<button type="button">More</button>} />);
    expect(screen.getByRole("button", { name: "More" })).toBeInTheDocument();
  });

  it("does not clip its own corner — the row menu must be able to hang below it", () => {
    const { container } = render(<ContentRow item={item()} />);
    const article = container.querySelector("article")!;
    expect(article.className).not.toContain("overflow-hidden");
    // No separate rail span: the colour is the row's own left border, which
    // follows the row's rounded corner by construction. Only the icon span
    // is left as aria-hidden.
    expect(container.querySelectorAll("span[aria-hidden]")).toHaveLength(1);
  });
});
