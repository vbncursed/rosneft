import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ConversionActions, FAILED_NOTE } from "./conversion-actions";

describe("ConversionActions", () => {
  it("offers a new source and the catalog after a failure, plus the viewer only when one exists", () => {
    const { rerender } = render(<ConversionActions phase="failed" slug="a b" hasLod0={false} />);
    expect(screen.getByRole("link", { name: "Upload a new source" })).toHaveAttribute("href", "/territories/a%20b/replace");
    expect(screen.getByRole("link", { name: "Back to catalog" })).toHaveAttribute("href", "/territories");
    expect(screen.queryByRole("link", { name: "Open the current viewer" })).not.toBeInTheDocument();
    expect(screen.getByText(FAILED_NOTE)).toBeInTheDocument();

    // The same URL this page is on: the click delegate navigates, the route
    // re-reads the bundle and branches into the viewer. No document load.
    rerender(<ConversionActions phase="failed" slug="a b" hasLod0 />);
    expect(screen.getByRole("link", { name: "Open the current viewer" })).toHaveAttribute("href", "/territories/a%20b");
  });

  it("offers the viewer and the catalog once ready", () => {
    render(<ConversionActions phase="ready" slug="t" hasLod0 />);
    expect(screen.getByRole("link", { name: "Open the viewer" })).toHaveAttribute("href", "/territories/t");
    expect(screen.getByRole("link", { name: "Back to catalog" })).toBeInTheDocument();
    expect(screen.queryByText(FAILED_NOTE)).not.toBeInTheDocument();
  });

  it("gives every hand-built control the focus ring and hover Button carries", () => {
    render(<ConversionActions phase="ready" slug="t" hasLod0 />);
    const primary = screen.getByRole("link", { name: "Open the viewer" });
    const secondary = screen.getByRole("link", { name: "Back to catalog" });
    for (const el of [primary, secondary]) {
      expect(el.className).toContain("focus-visible:outline-accent");
    }
    expect(primary.className).toContain("hover:bg-accent/90");
    expect(secondary.className).toContain("hover:border-accent-line");
  });

  it("draws nothing while waiting", () => {
    const { container } = render(<ConversionActions phase="running" slug="t" hasLod0={false} />);
    expect(container).toBeEmptyDOMElement();
  });
});
