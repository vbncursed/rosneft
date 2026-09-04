import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ContentPage, type ContentPageProps } from "./content-page";
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

const props = (over: Partial<ContentPageProps> = {}): ContentPageProps => ({
  groups: [
    {
      key: "attention",
      label: "Needs attention",
      note: "3 items",
      items: [
        item("terminal-yard-4", "Terminal Yard 4", { status: "converting", progress: 62, stage: "textures" }),
      ],
    },
    {
      key: "territories",
      label: "Territories",
      note: "12 items · 11 ready",
      items: [item("north-ridge-pad", "North Ridge Pad")],
    },
  ],
  pipeline: {
    label: "Pipeline state",
    detail: "40 / 43 ready",
    segments: [
      { tone: "ok", value: 40, label: "ready" },
      { tone: "warn", value: 2, label: "converting" },
      { tone: "bad", value: 1, label: "failed" },
    ],
  },
  stats: [
    { label: "Territories", value: "12", hint: "3 shared with guests" },
    { label: "Models", value: "31", hint: "placeable assets" },
    { label: "Storage", value: "184 GB", hint: "GLB + KTX2 artifacts", tone: "accent" },
  ],
  query: "",
  onQueryChange: vi.fn(),
  selectedSlug: null,
  onSelect: vi.fn(),
  onCloseInspector: vi.fn(),
  onUploadTerritory: vi.fn(),
  onUploadModel: vi.fn(),
  onReplaceSource: vi.fn(),
  onOpenInViewer: vi.fn(),
  onDelete: vi.fn(),
  ...over,
});

const inspected = (over = {}) => ({
  item: item("terminal-yard-4", "Terminal Yard 4", { status: "converting", progress: 62 }),
  details: [{ label: "job", value: "8f21 · mesh-worker-2" }],
  ...over,
});

describe("ContentPage", () => {
  it("names the page with one h1", () => {
    render(<ContentPage {...props()} />);
    expect(screen.getByRole("heading", { level: 1, name: "Content" })).toBeInTheDocument();
    expect(screen.getByText("Catalog · conversion pipeline")).toBeInTheDocument();
  });

  it("draws no chrome of its own — the layout owns the column", () => {
    render(<ContentPage {...props()} />);
    expect(screen.queryByRole("navigation", { name: "Console" })).not.toBeInTheDocument();
    expect(screen.queryByRole("main")).not.toBeInTheDocument();
  });

  it("summarises the pipeline above the list", () => {
    render(<ContentPage {...props()} />);
    expect(screen.getByText("40 / 43 ready")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Pipeline state/ })).toBeInTheDocument();
    expect(screen.getByText("Storage: 184 GB").parentElement!.className).toContain("text-accent");
  });

  it("groups the catalog", () => {
    render(<ContentPage {...props()} />);
    expect(screen.getByRole("region", { name: "Needs attention" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Territories" })).toBeInTheDocument();
  });

  it("filters through the command bar", async () => {
    const onQueryChange = vi.fn();
    render(<ContentPage {...props({ onQueryChange })} />);
    await userEvent.type(screen.getByRole("textbox", { name: "Filter content" }), "k");
    expect(onQueryChange).toHaveBeenCalled();
  });

  it("shows a chip for a key:value query", () => {
    render(<ContentPage {...props({ query: "kind:territory" })} />);
    expect(screen.getByRole("button", { name: "Remove filter kind:territory" })).toBeInTheDocument();
  });

  it("selects an item with the whole record", async () => {
    const onSelect = vi.fn();
    render(<ContentPage {...props({ onSelect })} />);
    await userEvent.click(screen.getByRole("article", { name: "North Ridge Pad" }));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ slug: "north-ridge-pad" }));
  });

  it("keeps the inspector out of the tree until an item is open", () => {
    render(<ContentPage {...props({ selectedSlug: "terminal-yard-4", inspected: null })} />);
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
  });

  it("opens the inspector on the selected item", () => {
    render(<ContentPage {...props({ selectedSlug: "terminal-yard-4", inspected: inspected() })} />);
    expect(
      screen.getByRole("complementary", { name: "Content: Terminal Yard 4" }),
    ).toBeInTheDocument();
    expect(screen.getByText("8f21 · mesh-worker-2")).toBeInTheDocument();
  });

  it("offers to cancel a job only while the item is converting", () => {
    const onCancelJob = vi.fn();
    const { rerender } = render(
      <ContentPage {...props({ selectedSlug: "terminal-yard-4", inspected: inspected(), onCancelJob })} />,
    );
    expect(screen.getByRole("button", { name: "Cancel job" })).toBeInTheDocument();

    rerender(
      <ContentPage
        {...props({
          selectedSlug: "north-ridge-pad",
          inspected: inspected({ item: item("north-ridge-pad", "North Ridge Pad") }),
          onCancelJob,
        })}
      />,
    );
    expect(screen.queryByRole("button", { name: "Cancel job" })).not.toBeInTheDocument();
  });

  it("offers both uploads", async () => {
    const onUploadTerritory = vi.fn();
    const onUploadModel = vi.fn();
    render(<ContentPage {...props({ onUploadTerritory, onUploadModel })} />);

    await userEvent.click(screen.getByRole("button", { name: "+ Model" }));
    await userEvent.click(screen.getByRole("button", { name: "+ Territory" }));
    expect(onUploadModel).toHaveBeenCalledOnce();
    expect(onUploadTerritory).toHaveBeenCalledOnce();
  });

  it("reaches the same upload from the drop target", async () => {
    const onUploadTerritory = vi.fn();
    render(<ContentPage {...props({ onUploadTerritory })} />);
    await userEvent.click(screen.getByRole("button", { name: /Upload an OBJ or GLB/ }));
    expect(onUploadTerritory).toHaveBeenCalledOnce();
  });

  it("hides every management control from a reader who may not manage content", () => {
    render(
      <ContentPage
        {...props({ canManage: false, selectedSlug: "terminal-yard-4", inspected: inspected() })}
      />,
    );
    expect(screen.queryByRole("button", { name: /^\+ /})).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Upload an OBJ/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
  });

  it("draws Replace source and Delete only when handed a handler", () => {
    render(
      <ContentPage
        {...props({
          selectedSlug: "terminal-yard-4",
          inspected: inspected(),
          onReplaceSource: undefined,
          onDelete: undefined,
        })}
      />,
    );
    expect(screen.queryByRole("button", { name: "Replace source" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
  });

  it("builds row actions per item", () => {
    render(
      <ContentPage
        {...props({ renderRowActions: (i) => <button type="button">{`More: ${i.title}`}</button> })}
      />,
    );
    expect(screen.getByRole("button", { name: "More: North Ridge Pad" })).toBeInTheDocument();
  });
});
