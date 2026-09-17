import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CatalogShell } from "./catalog-shell";

describe("CatalogShell", () => {
  it("puts its children in the main region", () => {
    render(
      <CatalogShell>
        <h1>Scenes to walk through</h1>
      </CatalogShell>,
    );
    expect(screen.getByRole("main")).toContainElement(
      screen.getByRole("heading", { name: "Scenes to walk through" }),
    );
  });

  it("renders exactly one main region and no sidebar navigation", () => {
    render(
      <CatalogShell>
        <p>content</p>
      </CatalogShell>,
    );
    expect(screen.getAllByRole("main")).toHaveLength(1);
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });
});

describe("CatalogShell · viewport layout", () => {
  it("drops the page padding and fills the viewport height", () => {
    render(
      <CatalogShell layout="viewport">
        <p>scene</p>
      </CatalogShell>,
    );
    const main = screen.getByRole("main");
    expect(main.className).toContain("h-dvh");
    expect(main.className).not.toContain("px-9");
    expect(main.className).not.toContain("pt-8");
  });

  it("keeps the page layout by default", () => {
    render(
      <CatalogShell>
        <p>page</p>
      </CatalogShell>,
    );
    expect(screen.getByRole("main").className).toContain("px-9");
  });
});

describe("CatalogShell · full-bleed marker", () => {
  // index.css reserves the scrollbar lane on every page except one that
  // carries this marker: a non-scrolling viewer would show an empty strip.
  it("marks the viewport layout as full-bleed", () => {
    render(
      <CatalogShell layout="viewport">
        <p>scene</p>
      </CatalogShell>,
    );
    expect(screen.getByRole("main").parentElement).toHaveAttribute("data-fullbleed");
  });

  it("leaves the page layout unmarked", () => {
    render(
      <CatalogShell>
        <p>page</p>
      </CatalogShell>,
    );
    expect(screen.getByRole("main").parentElement).not.toHaveAttribute("data-fullbleed");
  });
});
