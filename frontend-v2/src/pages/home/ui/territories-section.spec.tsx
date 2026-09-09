import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { TerritoryCardModel } from "@/entities/territory";
import { TerritoriesSection } from "./territories-section";

const card = (slug: string): TerritoryCardModel => ({
  slug,
  title: slug,
  description: "Wellhead cluster and gathering lines.",
  status: "ready",
  chips: [],
  trailing: { label: "Open →", tone: "accent" },
  panorama: false,
});

describe("TerritoriesSection", () => {
  it("draws the see-all link whenever the list is non-empty", () => {
    const { rerender } = render(
      <TerritoriesSection
        cards={[card("a"), card("b"), card("c"), card("d")]}
        total={4}
        meta="showing 4 of 4"
        viewerEmpty={false}
        onOpen={vi.fn()}
      />,
    );
    expect(screen.getByRole("link", { name: "See all 4 territories →" })).toHaveAttribute(
      "href",
      "/territories",
    );

    rerender(
      <TerritoriesSection
        cards={[]}
        total={0}
        meta="none yet"
        viewerEmpty={false}
        onOpen={vi.fn()}
      />,
    );
    expect(screen.queryByRole("link", { name: /See all/ })).not.toBeInTheDocument();
  });

  it("links every card to its territory page and opens on a card click", async () => {
    const onOpen = vi.fn();
    render(
      <TerritoriesSection
        cards={[card("north-ridge-pad")]}
        total={1}
        meta="showing 1 of 1"
        viewerEmpty={false}
        onOpen={onOpen}
      />,
    );
    expect(screen.getByRole("link", { name: "north-ridge-pad" })).toHaveAttribute(
      "href",
      "/territories/north-ridge-pad",
    );
    await userEvent.click(screen.getByRole("article"));
    expect(onOpen).toHaveBeenCalledWith("/territories/north-ridge-pad");
  });

  it("tells a viewer with nothing assigned, and an uploader with nothing yet, different things", () => {
    const { rerender } = render(
      <TerritoriesSection cards={[]} total={0} meta="assigned to you" viewerEmpty onOpen={vi.fn()} />,
    );
    expect(screen.getByText("No territories are assigned to you yet")).toBeInTheDocument();

    rerender(
      <TerritoriesSection
        cards={[]}
        total={0}
        meta="none yet"
        viewerEmpty={false}
        onOpen={vi.fn()}
      />,
    );
    expect(screen.getByText("No territories yet")).toBeInTheDocument();
    // Home draws no upload button any more, so the sentence names where one is.
    expect(
      screen.getByText(
        "Upload a source archive from the territory catalog and the first one will appear here.",
      ),
    ).toBeInTheDocument();
  });
});
