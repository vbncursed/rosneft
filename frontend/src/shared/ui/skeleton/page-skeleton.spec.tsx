import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PageSkeleton } from "./page-skeleton";

const bars = () => [...screen.getByRole("status").querySelectorAll<HTMLElement>("[aria-hidden='true']")];
const tall = (height: string) => bars().filter((b) => b.style.height === height);
const TILES = "lg:grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,1fr))]";

describe("PageSkeleton", () => {
  it("is one busy status named for what is loading", () => {
    render(<PageSkeleton shape="console" label="Loading people" />);
    const status = screen.getByRole("status", { name: "Loading people" });
    expect(status).toHaveAttribute("aria-busy", "true");
  });

  // The shape promises the layout that replaces it: the console screens'
  // own tile row (a wider first tile, one column below lg), the filter bar
  // and a grid of cards — not three generic bars.
  it("draws the console screen's shape, tiles on the pages' own template", () => {
    render(<PageSkeleton shape="console" label="Loading people" />);
    const tiles = tall("126px");
    expect(tiles).toHaveLength(4);
    const row = tiles[0].parentElement!;
    expect(row).toHaveClass("grid", TILES);
    expect(row.className).not.toMatch(/(^|\s)(md:)?grid-cols-/);
    expect(bars()).toHaveLength(2 + 4 + 1 + 6);
  });

  // The audit journal has no tile row: filters, the activity summary, then
  // the list of events.
  it("draws the journal's shape with no tile row", () => {
    render(<PageSkeleton shape="journal" label="Loading journal" />);
    expect(tall("126px")).toHaveLength(0);
    expect(tall("44px")).toHaveLength(1);
    expect(tall("115px")).toHaveLength(1);
    expect(tall("72px")).toHaveLength(6);
    // The feed sits in the journal's left column, not across the page.
    expect(tall("72px")[0].parentElement!.parentElement).toHaveClass(
      "xl:grid-cols-[minmax(420px,1fr)_minmax(280px,360px)]",
    );
  });

  it("draws the catalog's shape: a heading, the filter row and tall cards", () => {
    render(<PageSkeleton shape="catalog" label="Loading territories" />);
    expect(tall("280px")).toHaveLength(6);
    expect(bars()).toHaveLength(2 + 1 + 6);
  });

  // Replace Source: the form card beside its aside, stacked below lg.
  it("draws the form's shape: a card beside an aside", () => {
    render(<PageSkeleton shape="form" label="Loading territory" />);
    const card = tall("360px");
    expect(card).toHaveLength(1);
    expect(tall("240px")).toHaveLength(1);
    expect(card[0].parentElement).toHaveClass("lg:grid-cols-[minmax(420px,1fr)_minmax(300px,380px)]");
  });

  // The heading block stands in for PageHeader (eyebrow + h1 + action), so
  // the body starts where the page's will: 76px, 187px with Replace
  // Source's description under it.
  it("reserves the page header's height before the body", () => {
    const header = () => screen.getByRole("status").firstElementChild as HTMLElement;
    const { unmount } = render(<PageSkeleton shape="console" label="Loading people" />);
    expect(header().style.height).toBe("76px");
    expect([...header().children].map((b) => (b as HTMLElement).style.height)).toEqual(["10px", "40px"]);
    unmount();

    render(<PageSkeleton shape="form" label="Loading territory" />);
    expect(header().style.height).toBe("187px");
  });

  // A fast answer must not flash a placeholder: it only fades in after 150ms.
  it("waits 150ms before it shows, then fades in", () => {
    render(<PageSkeleton shape="catalog" label="Loading territories" />);
    expect(screen.getByRole("status")).toHaveClass(
      "starting:opacity-0",
      "transition-opacity",
      "delay-150",
      "duration-150",
    );
  });
});
