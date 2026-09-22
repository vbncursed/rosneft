import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CollapsedRail } from "./collapsed-rail";
import { hoverTip } from "@/shared/ui/tooltip/testing";

describe("CollapsedRail", () => {
  it("names the expand button and shows the label and the badge", async () => {
    const onExpand = vi.fn();
    render(<CollapsedRail label="Overlays" badge="4 placed" expandName="Expand Overlays panel" onExpand={onExpand} />);
    await userEvent.click(screen.getByRole("button", { name: "Expand Overlays panel" }));
    expect(onExpand).toHaveBeenCalledOnce();
    expect(screen.getByText("Overlays")).toBeInTheDocument();
    expect(screen.getByText("4 placed")).toBeInTheDocument();
  });
  it("draws no pill without a badge", () => {
    render(<CollapsedRail label="Overlays" expandName="Expand Overlays panel" onExpand={vi.fn()} />);
    expect(screen.queryByText(/placed/)).toBeNull();
  });

  // jsdom computes no styles, so the press is pinned by its tokens.
  it("presses the 28px expand button to 0.95 and animates the scale", () => {
    render(<CollapsedRail label="Overlays" expandName="Expand Overlays panel" onExpand={vi.fn()} />);
    const cls = screen.getByRole("button", { name: "Expand Overlays panel" }).className.split(/\s+/);
    expect(cls).toEqual(
      expect.arrayContaining(["active:scale-95", "transition-[color,background-color,border-color,scale]", "ease-out"]),
    );
    expect(cls).not.toContain("transition-colors");
  });
});

describe("CollapsedRail · tooltip", () => {
  it("names the expand button in a tooltip, not a native title", () => {
    render(<CollapsedRail label="Overlays" expandName="Expand Overlays panel" onExpand={vi.fn()} />);
    const expand = screen.getByRole("button", { name: "Expand Overlays panel" });
    expect(expand).not.toHaveAttribute("title");
    expect(hoverTip(expand)).toHaveTextContent("Expand Overlays panel");
  });
});
