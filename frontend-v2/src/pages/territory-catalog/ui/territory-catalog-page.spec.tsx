import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { TerritoryCardModel } from "../model/catalog";
import { TerritoryCatalogPage, type TerritoryCatalogPageProps } from "./territory-catalog-page";

const card = (slug: string, title: string, over: Partial<TerritoryCardModel> = {}): TerritoryCardModel => ({
  slug,
  title,
  status: "ready",
  chips: [{ label: "3 placements", tone: "plain" }],
  trailing: { label: "Open →", tone: "accent" },
  panorama: false,
  ...over,
});

const props = (over: Partial<TerritoryCatalogPageProps> = {}): TerritoryCatalogPageProps => ({
  cards: [
    card("north-ridge-pad", "North Ridge Pad"),
    card("terminal-yard-4", "Terminal Yard 4", {
      status: "converting",
      chips: [{ label: "LOD 0-1", tone: "warn" }],
      progress: { value: 62, stage: "Compressing textures" },
      trailing: { label: "converting", tone: "muted" },
    }),
  ],
  tab: "all",
  counts: { all: 6, ready: 4, converting: 2 },
  onTabChange: vi.fn(),
  query: "",
  onQueryChange: vi.fn(),
  canUpload: true,
  canDelete: true,
  canReplace: true,
  onUpload: vi.fn(),
  onOpen: vi.fn(),
  onReplace: vi.fn(),
  onDelete: vi.fn(),
  ...over,
});

describe("TerritoryCatalogPage", () => {
  it("names the page with one h1 and the lede", () => {
    render(<TerritoryCatalogPage {...props()} />);
    expect(screen.getByRole("heading", { level: 1, name: "Scenes to walk through" })).toBeInTheDocument();
    expect(screen.getByText("Territory catalog")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Sites you have access to. Open one to inspect it in 3D, measure distances and place models.",
      ),
    ).toBeInTheDocument();
    // No back link: this page *is* /territories, and v2 has no Home above it.
    expect(screen.queryByRole("link", { name: "← Home" })).not.toBeInTheDocument();
  });

  it("draws no chrome of its own — the shell owns the layout", () => {
    render(<TerritoryCatalogPage {...props()} />);
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    expect(screen.queryByRole("main")).not.toBeInTheDocument();
  });

  it("shows the tabs with their counts and switches on click", async () => {
    const onTabChange = vi.fn();
    render(<TerritoryCatalogPage {...props({ onTabChange })} />);
    expect(screen.getByRole("radio", { name: "All · 6" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "Ready · 4" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: "Converting · 2" }));
    expect(onTabChange).toHaveBeenCalledWith("converting");
  });

  it("filters through the command bar", async () => {
    const onQueryChange = vi.fn();
    render(<TerritoryCatalogPage {...props({ onQueryChange })} />);
    await userEvent.type(screen.getByRole("textbox", { name: "Filter territories" }), "s");
    expect(onQueryChange).toHaveBeenCalled();
  });

  it("opens every card, whatever it is converting — the territory page shows the state", async () => {
    const onOpen = vi.fn();
    render(<TerritoryCatalogPage {...props({ onOpen })} />);
    await userEvent.click(screen.getByRole("article", { name: "North Ridge Pad" }));
    expect(onOpen).toHaveBeenCalledWith("north-ridge-pad");
    await userEvent.click(screen.getByRole("article", { name: "Terminal Yard 4" }));
    expect(onOpen).toHaveBeenLastCalledWith("terminal-yard-4");
  });

  it("gives every card's title a real href", () => {
    render(<TerritoryCatalogPage {...props()} />);
    expect(screen.getByRole("link", { name: "North Ridge Pad" })).toHaveAttribute(
      "href",
      "/territories/north-ridge-pad",
    );
    expect(screen.getByRole("link", { name: "Terminal Yard 4" })).toHaveAttribute(
      "href",
      "/territories/terminal-yard-4",
    );
  });

  it("draws the running progress bar and its stage for the converting card", () => {
    render(<TerritoryCatalogPage {...props()} />);
    expect(screen.getByRole("progressbar", { name: "Compressing textures" })).toHaveAttribute(
      "aria-valuenow",
      "62",
    );
  });

  it("names Replace source and Delete controls after their card, uniquely", async () => {
    const onReplace = vi.fn();
    const onDelete = vi.fn();
    render(<TerritoryCatalogPage {...props({ onReplace, onDelete })} />);
    expect(screen.getAllByRole("button", { name: /^Replace source of /})).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: /^Delete /})).toHaveLength(2);
    await userEvent.click(screen.getByRole("button", { name: "Replace source of North Ridge Pad" }));
    expect(onReplace).toHaveBeenCalledWith("north-ridge-pad");
    await userEvent.click(screen.getByRole("button", { name: "Delete Terminal Yard 4" }));
    expect(onDelete).toHaveBeenCalledWith("terminal-yard-4");
  });

  it("hides the overlay actions without the matching grant", () => {
    render(<TerritoryCatalogPage {...props({ canReplace: false, canDelete: false })} />);
    expect(screen.queryByRole("button", { name: /^Replace source of /})).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Delete /})).not.toBeInTheDocument();
  });

  it("draws Replace source alone for a viewer who may not delete", () => {
    render(<TerritoryCatalogPage {...props({ canReplace: true, canDelete: false })} />);
    expect(screen.getAllByRole("button", { name: /^Replace source of /})).toHaveLength(2);
    expect(screen.queryByRole("button", { name: /^Delete /})).not.toBeInTheDocument();
  });

  it("draws Delete alone for a viewer who may not replace", () => {
    render(<TerritoryCatalogPage {...props({ canReplace: false, canDelete: true })} />);
    expect(screen.queryByRole("button", { name: /^Replace source of /})).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Delete /})).toHaveLength(2);
  });

  it("hides the theme-adjacent + Upload action and the footer CTA for a reader who may not upload", () => {
    render(<TerritoryCatalogPage {...props({ canUpload: false })} />);
    expect(screen.queryByRole("button", { name: "+ Upload" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Upload territory" })).not.toBeInTheDocument();
  });

  it("offers the footer CTA and reaches the same upload handler", async () => {
    const onUpload = vi.fn();
    render(<TerritoryCatalogPage {...props({ onUpload })} />);
    expect(screen.getByText("Add another territory")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "+ Upload" }));
    await userEvent.click(screen.getByRole("button", { name: "Upload territory" }));
    expect(onUpload).toHaveBeenCalledTimes(2);
  });

  it("says the catalog is empty rather than an empty grid", () => {
    render(<TerritoryCatalogPage {...props({ cards: [], emptyHint: "No territories yet." })} />);
    expect(screen.getByText("No territories yet.")).toBeInTheDocument();
  });

  it("falls back to a filter-miss sentence with no emptyHint given", () => {
    render(<TerritoryCatalogPage {...props({ cards: [] })} />);
    expect(screen.getByText("Nothing matches this filter.")).toBeInTheDocument();
  });
});
