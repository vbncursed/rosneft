import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PageHeader } from "./page-header";

describe("PageHeader", () => {
  it("names the page with a single top-level heading", () => {
    render(<PageHeader eyebrow="Territory catalog" title="Scenes to walk through" />);
    expect(
      screen.getByRole("heading", { level: 1, name: "Scenes to walk through" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Territory catalog")).toBeInTheDocument();
  });

  it("offers the way back up when there is one", () => {
    render(
      <PageHeader
        eyebrow="Territory catalog"
        title="Scenes"
        back={{ label: "← Home", href: "/" }}
      />,
    );
    expect(screen.getByRole("link", { name: "← Home" })).toHaveAttribute("href", "/");
  });

  it("omits the back link on a top-level page", () => {
    render(<PageHeader eyebrow="Home" title="Andrey 3D" />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("hosts the page's primary action", () => {
    render(
      <PageHeader
        eyebrow="Territory catalog"
        title="Scenes"
        action={<button type="button">+ Upload</button>}
      />,
    );
    expect(screen.getByRole("button", { name: "+ Upload" })).toBeInTheDocument();
  });

  it("is a banner region", () => {
    render(<PageHeader eyebrow="Models" title="Library" />);
    expect(screen.getByRole("banner")).toBeInTheDocument();
  });
});

describe("PageHeader · sizes", () => {
  it("scales up to the xl title the catalog pages use", () => {
    render(<PageHeader eyebrow="Territory catalog" title="Scenes to walk through" size="xl" />);
    expect(screen.getByRole("heading", { level: 1 }).className).toContain("text-[38px]");
  });

  it("clamps the description width by size — 56ch at lg, 52ch at xl", () => {
    const { rerender } = render(
      <PageHeader eyebrow="X" title="Y" size="lg" description="Something long enough to wrap." />,
    );
    expect(screen.getByText("Something long enough to wrap.").className).toContain("max-w-[56ch]");

    rerender(<PageHeader eyebrow="X" title="Y" size="xl" description="Something long enough to wrap." />);
    expect(screen.getByText("Something long enough to wrap.").className).toContain("max-w-[52ch]");
  });

  it("gives the back link more room before an lg/xl eyebrow than at md", () => {
    render(<PageHeader eyebrow="X" title="Y" size="xl" back={{ label: "← Home", href: "/" }} />);
    expect(screen.getByText("X").className).toContain("mt-4");
  });
});

describe("PageHeader · description", () => {
  it("explains the page when it needs explaining", () => {
    render(
      <PageHeader
        eyebrow="Catalog"
        title="Content"
        description="Territories, models and their conversion artifacts."
      />,
    );
    expect(
      screen.getByText("Territories, models and their conversion artifacts."),
    ).toBeInTheDocument();
  });

  it("says nothing extra when there is nothing to add", () => {
    const { container } = render(<PageHeader eyebrow="Models" title="Library" />);
    expect(container.querySelectorAll("p")).toHaveLength(1);
  });
});
