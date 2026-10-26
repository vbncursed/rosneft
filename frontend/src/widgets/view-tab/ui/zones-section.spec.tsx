import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { NO_PLAN_NOTE, zonesCount } from "../model/copy";
import { ZonesSection, type ZonesSectionProps } from "./zones-section";

const base = (over: Partial<ZonesSectionProps> = {}): ZonesSectionProps => ({
  count: 2,
  show: true,
  onToggle: vi.fn(),
  plan: { available: true, show: false, onToggle: vi.fn(), opacity: 0.6, onOpacity: vi.fn() },
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

  it("switches the plan on, and only then offers its opacity", async () => {
    const props = base();
    const { rerender } = render(<ZonesSection {...props} />);
    expect(screen.queryByRole("slider", { name: "Plan opacity" })).toBeNull();
    await userEvent.click(screen.getByRole("switch", { name: "Show plan" }));
    expect(props.plan.onToggle).toHaveBeenCalledOnce();

    rerender(<ZonesSection {...base({ plan: { ...props.plan, show: true } })} />);
    expect(screen.getByRole("slider", { name: "Plan opacity" })).toHaveValue("0.6");
  });

  it("has no plan to show until one is aligned, and says how to get one", () => {
    render(<ZonesSection {...base({ plan: { ...base().plan, available: false } })} />);
    expect(screen.getByRole("switch", { name: "Show plan" })).toBeDisabled();
    expect(screen.getByText(NO_PLAN_NOTE)).toBeInTheDocument();
  });
});

describe("ZonesSection tour anchor", () => {
  it("is the tour's anchor for the zones switches", () => {
    render(<ZonesSection {...base()} />);
    expect(screen.getByRole("region", { name: "Zones" })).toHaveAttribute("data-tour", "zones-section");
  });
});
