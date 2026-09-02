import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Badge } from "@/shared/ui/badge";
import { CatalogCard } from "./catalog-card";

describe("CatalogCard", () => {
  it("names the kind, the title and the slug", () => {
    render(<CatalogCard kind="Territory" title="Refinery Block C" slug="refinery-block-c" />);
    expect(screen.getByText("Territory")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Refinery Block C" })).toBeInTheDocument();
    expect(screen.getByText("refinery-block-c")).toBeInTheDocument();
  });

  it("puts the link on the heading, so buttons may sit alongside it", () => {
    render(
      <CatalogCard
        kind="Territory"
        title="Refinery Block C"
        slug="refinery-block-c"
        href="/territories/refinery-block-c"
        actions={<button type="button">Delete</button>}
      />,
    );
    const link = screen.getByRole("link", { name: "Refinery Block C" });
    expect(link).toHaveAttribute("href", "/territories/refinery-block-c");
    expect(link.closest("a")).not.toContainElement(screen.getByRole("button", { name: "Delete" }));
  });

  it("renders an unlinked card as plain text", () => {
    render(<CatalogCard kind="Model" title="Flare Stack" slug="flare-stack" />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Flare Stack" })).toBeInTheDocument();
  });

  it("shows a badge when there are no actions, and actions when there are", () => {
    const { rerender } = render(
      <CatalogCard kind="Territory" title="T" slug="t" badge={<Badge tone="ok">ready</Badge>} />,
    );
    expect(screen.getByText("ready")).toBeInTheDocument();

    rerender(
      <CatalogCard
        kind="Territory"
        title="T"
        slug="t"
        badge={<Badge tone="ok">ready</Badge>}
        actions={<button type="button">Replace</button>}
      />,
    );
    expect(screen.queryByText("ready")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Replace" })).toBeInTheDocument();
  });

  it("carries a trailing footer note", () => {
    render(<CatalogCard kind="Model" title="Flare Stack" slug="flare-stack" trailing="42%" />);
    expect(screen.getByText("42%")).toBeInTheDocument();
  });

  it("dims a card with nothing to open", () => {
    const { container } = render(
      <CatalogCard kind="Model" title="Flare Stack" slug="flare-stack" muted />,
    );
    expect(container.firstElementChild!.className).toContain("opacity-70");
    expect(screen.getByText("Model").className).toContain("text-muted");
  });

  it("accents a highlighted card and its footer", () => {
    const { container } = render(
      <CatalogCard kind="Territory" title="North Ridge Pad" slug="north-ridge-pad" highlighted />,
    );
    expect(container.firstElementChild!.className).toContain("border-accent");
    expect(screen.getByText("north-ridge-pad").parentElement!.className).toContain("text-accent");
  });

  it("omits the description paragraph when there is none", () => {
    const { container } = render(<CatalogCard kind="Model" title="T" slug="t" />);
    expect(container.querySelectorAll("p")).toHaveLength(0);
  });
});
