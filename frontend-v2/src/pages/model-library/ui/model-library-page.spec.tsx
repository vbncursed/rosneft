import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ModelCardModel } from "../model/catalog";
import { ModelLibraryPage, type ModelLibraryPageProps } from "./model-library-page";

const card = (slug: string, title: string, over: Partial<ModelCardModel> = {}): ModelCardModel => ({
  slug,
  title,
  status: "ready",
  thumbnailUrl: "/api/assets/x",
  usageCount: 6,
  size: "38 MB",
  lods: "LOD 0-2",
  trailing: { label: "in 6 territories", tone: "accent" },
  ...over,
});

const props = (over: Partial<ModelLibraryPageProps> = {}): ModelLibraryPageProps => ({
  cards: [
    card("pump-jack-unit", "Pump Jack Unit"),
    card("separator-vessel", "Separator Vessel", {
      status: "converting",
      thumbnailUrl: null,
      usageCount: 0,
      trailing: { label: "queued", tone: "warn" },
    }),
  ],
  tab: "all",
  counts: { all: 8, inUse: 6, noImage: 2 },
  onTabChange: vi.fn(),
  query: "",
  onQueryChange: vi.fn(),
  canUpload: true,
  canDelete: true,
  onUpload: vi.fn(),
  onOpen: vi.fn(),
  onDelete: vi.fn(),
  ...over,
});

describe("ModelLibraryPage", () => {
  it("names the page with one h1 and the lede", () => {
    render(<ModelLibraryPage {...props()} />);
    expect(screen.getByRole("heading", { level: 1, name: "Models for placement" })).toBeInTheDocument();
    expect(screen.getByText("Model catalog")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Reusable equipment you can drop onto any territory. Thumbnails come from the model detail page.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "← Home" })).toHaveAttribute("href", "/territories");
  });

  it("gives each card's title a real href into the model's page", () => {
    render(<ModelLibraryPage {...props()} />);
    expect(screen.getByRole("link", { name: "Pump Jack Unit" })).toHaveAttribute(
      "href",
      "/models/pump-jack-unit",
    );
  });

  it("draws no chrome of its own — the shell owns the layout", () => {
    render(<ModelLibraryPage {...props()} />);
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    expect(screen.queryByRole("main")).not.toBeInTheDocument();
  });

  it("shows the tabs with their counts and switches on click", async () => {
    const onTabChange = vi.fn();
    render(<ModelLibraryPage {...props({ onTabChange })} />);
    expect(screen.getByRole("radio", { name: "All · 8" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "In use · 6" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: "No image · 2" }));
    expect(onTabChange).toHaveBeenCalledWith("noImage");
  });

  it("filters through the command bar", async () => {
    const onQueryChange = vi.fn();
    render(<ModelLibraryPage {...props({ onQueryChange })} />);
    await userEvent.type(screen.getByRole("textbox", { name: "Filter models" }), "s");
    expect(onQueryChange).toHaveBeenCalled();
  });

  it("opens a card via onOpen", async () => {
    const onOpen = vi.fn();
    render(<ModelLibraryPage {...props({ onOpen })} />);
    await userEvent.click(screen.getByRole("article", { name: "Pump Jack Unit" }));
    expect(onOpen).toHaveBeenCalledWith("pump-jack-unit");
  });

  it("draws the badge only while converting or failed", () => {
    render(<ModelLibraryPage {...props()} />);
    expect(screen.getByText("converting")).toBeInTheDocument();
    expect(screen.queryByText("ready")).not.toBeInTheDocument();
  });

  it("names Delete controls after their card, uniquely, and hides them without the grant", async () => {
    const onDelete = vi.fn();
    const { rerender } = render(<ModelLibraryPage {...props({ onDelete })} />);
    expect(screen.getAllByRole("button", { name: /^Delete /})).toHaveLength(2);
    // Separator Vessel is the unused (enabled) one — Pump Jack Unit is placed.
    await userEvent.click(screen.getByRole("button", { name: "Delete Separator Vessel" }));
    expect(onDelete).toHaveBeenCalledWith("separator-vessel");

    rerender(<ModelLibraryPage {...props({ canDelete: false })} />);
    expect(screen.queryByRole("button", { name: /^Delete /})).not.toBeInTheDocument();
  });

  it("disables Delete for a placed model, folding the reason into its accessible name", () => {
    render(<ModelLibraryPage {...props()} />);
    const button = screen.getByRole("button", { name: /remove its placements first/ });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleName("Delete Pump Jack Unit — remove its placements first");
    expect(button).toHaveAttribute("title", "Remove its placements first");
  });

  it("leaves Delete enabled for an unused model, with its plain name and no title", () => {
    render(<ModelLibraryPage {...props()} />);
    const button = screen.getByRole("button", { name: "Delete Separator Vessel" });
    expect(button).not.toBeDisabled();
    expect(button).not.toHaveAttribute("title");
  });

  it("shows a card's footer usage and size text together", () => {
    render(
      <ModelLibraryPage
        {...props({
          cards: [
            card("pipe-rack-segment", "Pipe Rack Segment", {
              usageCount: 3,
              size: "26 MB",
              trailing: { label: "in 3 territories", tone: "accent" },
            }),
          ],
        })}
      />,
    );
    const article = screen.getByRole("article", { name: "Pipe Rack Segment" });
    expect(article).toHaveTextContent("in 3 territories");
    expect(article).toHaveTextContent("26 MB");
  });

  it("hides the theme-adjacent + Upload action and the footer CTA for a reader who may not upload", () => {
    render(<ModelLibraryPage {...props({ canUpload: false })} />);
    expect(screen.queryByRole("button", { name: "+ Upload" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Upload models" })).not.toBeInTheDocument();
  });

  it("offers the footer CTA and reaches the same upload handler", async () => {
    const onUpload = vi.fn();
    render(<ModelLibraryPage {...props({ onUpload })} />);
    expect(screen.getByText("Add models in bulk")).toBeInTheDocument();
    expect(
      screen.getByText("Pick several ZIP archives at once — titles autofill from filenames."),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "+ Upload" }));
    await userEvent.click(screen.getByRole("button", { name: "Upload models" }));
    expect(onUpload).toHaveBeenCalledTimes(2);
  });

  it("says the library is empty rather than an empty grid", () => {
    render(<ModelLibraryPage {...props({ cards: [], emptyHint: "No models yet." })} />);
    expect(screen.getByText("No models yet.")).toBeInTheDocument();
  });

  it("falls back to a filter-miss sentence with no emptyHint given", () => {
    render(<ModelLibraryPage {...props({ cards: [] })} />);
    expect(screen.getByText("Nothing matches this filter.")).toBeInTheDocument();
  });
});
