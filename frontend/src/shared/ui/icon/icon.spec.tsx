import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Icon } from "./icon";
import { ICON_NAMES } from "./glyphs";

describe("Icon", () => {
  it("hides a decorative icon from assistive tech", () => {
    const { container } = render(<Icon name="pencil" />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.getAttribute("role")).toBeNull();
  });

  it("exposes a titled icon as an image", () => {
    render(<Icon name="trash" title="Delete" />);
    expect(screen.getByRole("img", { name: "Delete" })).toBeDefined();
  });

  it("draws every glyph on one 24 grid at one 1.75 stroke", () => {
    for (const name of ICON_NAMES) {
      const svg = render(<Icon name={name} />).container.querySelector("svg")!;
      expect(svg.getAttribute("viewBox")).toBe("0 0 24 24");
      expect(svg.getAttribute("fill")).toBe("none");
      expect(svg.getAttribute("stroke")).toBe("currentColor");
      expect(svg.getAttribute("stroke-width")).toBe("1.75");
    }
  });

  it("lets a caller override the stroke", () => {
    const svg = render(<Icon name="cube" strokeWidth={0.7} />).container.querySelector("svg")!;
    expect(svg.getAttribute("stroke-width")).toBe("0.7");
  });

  it("renders the newly added glyphs", () => {
    for (const name of ["minus", "grid", "list"] as const) {
      const { container } = render(<Icon name={name} />);
      expect(container.querySelector("svg")).toBeInTheDocument();
    }
  });

  it("renders every name in the registry with the given size", () => {
    for (const name of ICON_NAMES) {
      const { container } = render(<Icon name={name} size={26} />);
      const svg = container.querySelector("svg")!;
      expect(svg.getAttribute("width")).toBe("26");
      expect(svg.childElementCount).toBeGreaterThan(0);
    }
  });

  it.each(["panorama", "file", "maximize", "minimize", "grip", "arrow-up", "close", "reset", "documents", "help"] as const)(
    "draws the %s glyph",
    (name) => {
      const { container } = render(<Icon name={name} />);
      expect(container.querySelector("svg")).not.toBeNull();
    },
  );
});
