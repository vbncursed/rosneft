import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CollapsedRail } from "./collapsed-rail";

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
});
