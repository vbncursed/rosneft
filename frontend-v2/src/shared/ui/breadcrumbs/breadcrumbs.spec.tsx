import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Breadcrumbs } from "./breadcrumbs";

const ITEMS = [
  { label: "Catalog", href: "/" },
  { label: "Territories", href: "/territories" },
  { label: "refinery-block-c" },
];

describe("Breadcrumbs", () => {
  it("is a labelled navigation landmark", () => {
    render(<Breadcrumbs items={ITEMS} />);
    expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toBeInTheDocument();
  });

  it("links every crumb but the last", () => {
    render(<Breadcrumbs items={ITEMS} />);
    expect(screen.getByRole("link", { name: "Catalog" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "Territories" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "refinery-block-c" })).not.toBeInTheDocument();
  });

  it("marks the last crumb as the current page", () => {
    render(<Breadcrumbs items={ITEMS} />);
    expect(screen.getByText("refinery-block-c")).toHaveAttribute("aria-current", "page");
  });

  it("does not link a crumb given without an href", () => {
    render(<Breadcrumbs items={[{ label: "Catalog" }, { label: "Now" }]} />);
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });

  it("renders a single crumb as the current page", () => {
    render(<Breadcrumbs items={[{ label: "Home", href: "/" }]} />);
    expect(screen.getByText("Home")).toHaveAttribute("aria-current", "page");
  });
});
