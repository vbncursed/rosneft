import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ViewerHeaderProps } from "../model/page-props";
import { ViewerHeader } from "./viewer-header";

const props = (over: Partial<ViewerHeaderProps> = {}): ViewerHeaderProps => ({
  slug: "refinery-block-c",
  title: "Refinery Block C",
  pills: [{ tone: "ok", label: "ready" }],
  meta: "refinery-block-c · 3 LODs · metres",
  guest: false,
  canReplace: true,
  ...over,
});

describe("ViewerHeader", () => {
  it("names the territory as the page's heading", () => {
    render(<ViewerHeader {...props()} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Refinery Block C");
  });

  it("leads with the way back to the catalog, anchored for the tour", () => {
    const { container } = render(<ViewerHeader {...props()} />);
    const back = screen.getByRole("link", { name: "← Territories" });
    expect(back).toHaveAttribute("href", "/territories");
    expect(container.querySelector('[data-tour="catalog-link"]')).toBe(back);
  });

  it("draws one pill per reading, in the order it was given", () => {
    render(
      <ViewerHeader
        {...props({
          pills: [
            { tone: "ok", label: "ready" },
            { tone: "neutral", label: "viewer · read-only" },
            { tone: "accent", label: "measuring" },
          ],
        })}
      />,
    );
    const status = screen.getByRole("status", { name: "Scene status" });
    expect([...status.children].map((c) => c.textContent)).toEqual([
      "ready",
      "viewer · read-only",
      "measuring",
    ]);
  });

  it("prints the meta line when there is one", () => {
    render(<ViewerHeader {...props()} />);
    expect(screen.getByText("refinery-block-c · 3 LODs · metres")).toBeInTheDocument();
  });

  it("prints no meta line when the page gave none", () => {
    render(<ViewerHeader {...props({ meta: null })} />);
    expect(screen.queryByText(/3 LODs/)).not.toBeInTheDocument();
  });

  it("offers Replace source to a reader who may write the territory", () => {
    render(<ViewerHeader {...props()} />);
    expect(screen.getByRole("link", { name: /Replace source/ })).toHaveAttribute(
      "href",
      "/territories/refinery-block-c/replace",
    );
  });

  it("escapes the slug in the replace link", () => {
    render(<ViewerHeader {...props({ slug: "a b" })} />);
    expect(screen.getByRole("link", { name: /Replace source/ })).toHaveAttribute(
      "href",
      "/territories/a%20b/replace",
    );
  });

  it("offers no Replace source without the grant", () => {
    render(<ViewerHeader {...props({ canReplace: false })} />);
    expect(screen.queryByRole("link", { name: /Replace source/ })).not.toBeInTheDocument();
  });

  it("tells a guest what it can still do, in place of the action", () => {
    render(<ViewerHeader {...props({ guest: true, canReplace: false })} />);
    expect(screen.getByText("You can look and measure.")).toBeInTheDocument();
  });

  it("says nothing of the sort to a reader who can edit", () => {
    render(<ViewerHeader {...props()} />);
    expect(screen.queryByText("You can look and measure.")).not.toBeInTheDocument();
  });
});
