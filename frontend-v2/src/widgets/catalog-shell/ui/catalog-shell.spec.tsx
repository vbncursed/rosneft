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
