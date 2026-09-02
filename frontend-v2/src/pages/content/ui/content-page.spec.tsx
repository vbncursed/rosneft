import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ContentPage, type ContentPageProps } from "./content-page";
import type { ContentItem } from "@/entities/content";

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

const props = (over: Partial<ContentPageProps> = {}): ContentPageProps => ({
  items: [item(), item({ kind: "model", slug: "pump-jack-unit", title: "Pump Jack Unit" })],
  counts: { all: 43, territory: 12, model: 31 },
  stats: [
    { label: "Territories", value: "12", hint: "3 shared with guests" },
    { label: "Models", value: "31", hint: "placeable assets" },
    { label: "Converting", value: "2", hint: "in flight · 1 failed", tone: "bad" },
    { label: "Storage", value: "184 GB", hint: "GLB + KTX2 artifacts", tone: "accent" },
  ],
  jobs: [
    { id: "1", slug: "terminal-yard-4", state: "running", progress: 62, stage: "Compressing…", eta: "~4 min" },
  ],
  tab: "all",
  onTabChange: vi.fn(),
  query: "",
  onQueryChange: vi.fn(),
  onUploadTerritory: vi.fn(),
  onUploadModel: vi.fn(),
  ...over,
});

describe("ContentPage", () => {
  it("names the page and explains it", () => {
    render(<ContentPage {...props()} />);
    expect(screen.getByRole("heading", { level: 1, name: "Content" })).toBeInTheDocument();
    expect(
      screen.getByText("Territories, models and their conversion artifacts."),
    ).toBeInTheDocument();
  });

  it("draws no chrome of its own — the layout owns the column", () => {
    render(<ContentPage {...props()} />);
    expect(screen.queryByRole("navigation", { name: "Console" })).not.toBeInTheDocument();
    expect(screen.queryByRole("main")).not.toBeInTheDocument();
  });

  it("summarises the catalog above the grid", () => {
    render(<ContentPage {...props()} />);
    expect(screen.getByLabelText("Territories: 12")).toBeInTheDocument();
    expect(screen.getByLabelText("Storage: 184 GB").className).toContain("text-accent");
  });

  it("counts every kind in its tab, whatever the query narrowed to", () => {
    render(<ContentPage {...props({ query: "refinery", items: [item()] })} />);
    expect(screen.getByRole("tab", { name: "All · 43" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Models · 31" })).toBeInTheDocument();
  });

  it("switches tabs", async () => {
    const onTabChange = vi.fn();
    render(<ContentPage {...props({ onTabChange })} />);
    await userEvent.click(screen.getByRole("tab", { name: /Territories/ }));
    expect(onTabChange).toHaveBeenCalledWith("territory");
  });

  it("reports what is searched for", async () => {
    const onQueryChange = vi.fn();
    render(<ContentPage {...props({ onQueryChange })} />);
    await userEvent.type(screen.getByRole("searchbox", { name: "Search content" }), "r");
    expect(onQueryChange).toHaveBeenCalled();
  });

  it("renders one card per item", () => {
    render(<ContentPage {...props()} />);
    expect(screen.getAllByRole("article")).toHaveLength(2);
  });

  it("offers both uploads, and a way out of an empty result", async () => {
    const onUploadTerritory = vi.fn();
    const onUploadModel = vi.fn();
    render(<ContentPage {...props({ onUploadTerritory, onUploadModel })} />);

    await userEvent.click(screen.getByRole("button", { name: "+ Upload model" }));
    await userEvent.click(screen.getByRole("button", { name: "+ Upload territory" }));
    expect(onUploadModel).toHaveBeenCalledOnce();
    expect(onUploadTerritory).toHaveBeenCalledOnce();
  });

  it("says so when nothing matches, and offers the way forward", () => {
    render(<ContentPage {...props({ items: [] })} />);
    expect(screen.getByText("Nothing matches")).toBeInTheDocument();
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "+ Upload territory" }).length).toBeGreaterThan(0);
  });

  it("passes both row actions down, each carrying the item it acts on", async () => {
    const onDelete = vi.fn();
    const onReplace = vi.fn();
    render(<ContentPage {...props({ onDelete, onReplace })} />);

    await userEvent.click(screen.getByRole("button", { name: "Delete North Ridge Pad" }));
    expect(onDelete).toHaveBeenCalledWith(expect.objectContaining({ slug: "north-ridge-pad" }));

    await userEvent.click(screen.getByRole("button", { name: "Replace source of Pump Jack Unit" }));
    expect(onReplace).toHaveBeenCalledWith(expect.objectContaining({ slug: "pump-jack-unit" }));
  });

  it("hides every management control from a reader who may not manage content", () => {
    render(<ContentPage {...props({ canManage: false, onDelete: vi.fn() })} />);
    expect(screen.queryByRole("button", { name: /Upload/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Delete/ })).not.toBeInTheDocument();
  });

  it("shows what is converting under the grid", () => {
    render(<ContentPage {...props()} />);
    expect(screen.getByRole("list", { name: "Conversion queue" })).toBeInTheDocument();
    expect(screen.getByText("terminal-yard-4")).toBeInTheDocument();
  });
});
