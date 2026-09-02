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

  it("draws kebab filled and the stroke glyphs stroked", () => {
    const { container: kebab } = render(<Icon name="kebab" />);
    expect(kebab.querySelector("svg")!.getAttribute("fill")).toBe("currentColor");

    const { container: ruler } = render(<Icon name="ruler" />);
    expect(ruler.querySelector("svg")!.getAttribute("stroke")).toBe("currentColor");
    expect(ruler.querySelector("svg")!.getAttribute("stroke-width")).toBe("1.6");
  });

  it("renders every name in the registry with the given size", () => {
    for (const name of ICON_NAMES) {
      const { container } = render(<Icon name={name} size={26} />);
      const svg = container.querySelector("svg")!;
      expect(svg.getAttribute("width")).toBe("26");
      expect(svg.childElementCount).toBeGreaterThan(0);
    }
  });
});
