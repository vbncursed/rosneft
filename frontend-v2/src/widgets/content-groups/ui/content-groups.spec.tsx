import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ContentGroups, type ContentGroup } from "./content-groups";
import type { ContentItem } from "@/entities/content";

const item = (slug: string, title: string, over: Partial<ContentItem> = {}): ContentItem => ({
  kind: "territory",
  slug,
  title,
  status: "ready",
  meta: `${slug} · upd. 31.08`,
  lods: "LOD 0-2",
  size: "412 MB",
  ...over,
});

const GROUPS: ContentGroup[] = [
  {
    key: "attention",
    label: "Needs attention",
    note: "3 items",
    items: [item("terminal-yard-4", "Terminal Yard 4", { status: "converting", progress: 62 })],
  },
  {
    key: "territories",
    label: "Territories",
    note: "12 items · 11 ready",
    items: [item("north-ridge-pad", "North Ridge Pad"), item("refinery-block-c", "Refinery Block C")],
  },
];

describe("ContentGroups", () => {
  it("renders a labelled section per group with its note", () => {
    render(<ContentGroups groups={GROUPS} />);
    expect(screen.getByRole("region", { name: "Needs attention" })).toBeInTheDocument();
    expect(screen.getByText("12 items · 11 ready")).toBeInTheDocument();
  });

  it("renders one row per item", () => {
    render(<ContentGroups groups={GROUPS} />);
    expect(screen.getAllByRole("article")).toHaveLength(3);
  });

  it("marks the selected row", () => {
    render(<ContentGroups groups={GROUPS} selectedSlug="north-ridge-pad" />);
    expect(screen.getByRole("article", { name: "North Ridge Pad" })).toHaveAttribute(
      "aria-current",
      "true",
    );
  });

  it("reports a selection with the whole item", async () => {
    const onSelect = vi.fn();
    render(<ContentGroups groups={GROUPS} onSelect={onSelect} />);
    await userEvent.click(screen.getByRole("article", { name: "Refinery Block C" }));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ slug: "refinery-block-c" }));
  });

  it("builds row actions per item", () => {
    render(
      <ContentGroups
        groups={GROUPS}
        renderActions={(i) => <button type="button">{`Actions for ${i.title}`}</button>}
      />,
    );
    expect(screen.getByRole("button", { name: "Actions for North Ridge Pad" })).toBeInTheDocument();
  });

  it("hides a group the filter emptied", () => {
    render(<ContentGroups groups={[...GROUPS, { key: "models", label: "Models", items: [] }]} />);
    expect(screen.queryByRole("region", { name: "Models" })).not.toBeInTheDocument();
  });

  it("says the filter matched nothing rather than showing empty headings", () => {
    render(<ContentGroups groups={[{ key: "models", label: "Models", items: [] }]} />);
    expect(screen.getByText("Nothing matches this filter.")).toBeInTheDocument();
    expect(screen.getByText("Loosen the filter to see more of the catalog.")).toBeInTheDocument();
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });

  it("drops the loosen-the-filter line when the caller worded the empty list itself", () => {
    render(<ContentGroups groups={[]} emptyHint="Nothing uploaded yet — start with a territory." />);
    expect(screen.getByText("Nothing uploaded yet — start with a territory.")).toBeInTheDocument();
    expect(screen.queryByText(/Loosen the filter/)).not.toBeInTheDocument();
  });

  it("says what the drop target actually does — it opens a form, it takes no drop", () => {
    render(<ContentGroups groups={GROUPS} onDropZoneClick={vi.fn()} />);
    expect(
      screen.getByRole("button", { name: "Upload an OBJ or GLB — opens the upload form" }),
    ).toBeInTheDocument();
  });

  it("keeps the drop target available even when the filter matched nothing", async () => {
    const onDropZoneClick = vi.fn();
    render(<ContentGroups groups={[]} onDropZoneClick={onDropZoneClick} />);
    await userEvent.click(screen.getByRole("button", { name: /Upload an OBJ or GLB/ }));
    expect(onDropZoneClick).toHaveBeenCalledOnce();
  });

  it("offers no drop target to a reader who may not upload", () => {
    render(<ContentGroups groups={GROUPS} />);
    expect(screen.queryByRole("button", { name: /Upload an OBJ/ })).not.toBeInTheDocument();
  });
});
