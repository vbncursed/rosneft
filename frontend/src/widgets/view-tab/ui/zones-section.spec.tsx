import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { zonesCount } from "../model/copy";
import { ZonesSection, type ZonesSectionProps } from "./zones-section";

const base = (over: Partial<ZonesSectionProps> = {}): ZonesSectionProps => ({
  count: 2,
  show: true,
  onToggle: vi.fn(),
  ...over,
});

describe("ZonesSection", () => {
  it("counts the zones and switches them", async () => {
    const props = base();
    render(<ZonesSection {...props} />);
    expect(screen.getByRole("region", { name: "Zones" })).toBeInTheDocument();
    expect(screen.getByText(zonesCount(2))).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Show zones" })).toBeChecked();
    await userEvent.click(screen.getByRole("switch", { name: "Show zones" }));
    expect(props.onToggle).toHaveBeenCalledOnce();
  });

  it("says one zone, not 1 zones", () => {
    render(<ZonesSection {...base({ count: 1 })} />);
    expect(screen.getByText("1 zone")).toBeInTheDocument();
  });

  it("has no switch for the plan picture: the PDF is not drawn in the scene", () => {
    render(<ZonesSection {...base()} />);
    expect(screen.queryByRole("switch", { name: "Show plan" })).toBeNull();
    expect(screen.queryByRole("slider")).toBeNull();
  });
});

describe("ZonesSection tour anchor", () => {
  it("is the tour's anchor for the zones switches", () => {
    render(<ZonesSection {...base()} />);
    expect(screen.getByRole("region", { name: "Zones" })).toHaveAttribute("data-tour", "zones-section");
  });
});
