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
