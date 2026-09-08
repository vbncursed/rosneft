import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ConversionActions, FAILED_NOTE } from "./conversion-actions";

describe("ConversionActions", () => {
  it("offers a new source and the catalog after a failure, plus the viewer only when one exists", async () => {
    const onOpenViewer = vi.fn();
    const { rerender } = render(<ConversionActions phase="failed" slug="a b" hasLod0={false} onOpenViewer={onOpenViewer} />);
    expect(screen.getByRole("link", { name: "Upload a new source" })).toHaveAttribute("href", "/territories/a%20b/replace");
    expect(screen.getByRole("link", { name: "Back to catalog" })).toHaveAttribute("href", "/territories");
    expect(screen.queryByRole("button", { name: "Open the current viewer" })).not.toBeInTheDocument();
    expect(screen.getByText(FAILED_NOTE)).toBeInTheDocument();

    rerender(<ConversionActions phase="failed" slug="a b" hasLod0 onOpenViewer={onOpenViewer} />);
    await userEvent.click(screen.getByRole("button", { name: "Open the current viewer" }));
    expect(onOpenViewer).toHaveBeenCalledTimes(1);
  });

  it("offers the viewer and the catalog once ready", async () => {
    const onOpenViewer = vi.fn();
    render(<ConversionActions phase="ready" slug="t" hasLod0 onOpenViewer={onOpenViewer} />);
    await userEvent.click(screen.getByRole("button", { name: "Open the viewer" }));
    expect(onOpenViewer).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("link", { name: "Back to catalog" })).toBeInTheDocument();
    expect(screen.queryByText(FAILED_NOTE)).not.toBeInTheDocument();
  });

  it("gives every hand-built control the focus ring and hover Button carries", () => {
    render(<ConversionActions phase="ready" slug="t" hasLod0 onOpenViewer={vi.fn()} />);
    const primary = screen.getByRole("button", { name: "Open the viewer" });
    const secondary = screen.getByRole("link", { name: "Back to catalog" });
    for (const el of [primary, secondary]) {
      expect(el.className).toContain("focus-visible:outline-accent");
    }
    expect(primary.className).toContain("hover:bg-accent/90");
    expect(secondary.className).toContain("hover:border-accent-line");
  });

  it("draws nothing while waiting", () => {
    const { container } = render(<ConversionActions phase="running" slug="t" hasLod0={false} onOpenViewer={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});
