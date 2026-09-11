import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { overlaysWidthClass } from "../model/overlays-width";
import { OverlaysPanel } from "./overlays-panel";

describe("OverlaysPanel", () => {
  it("is a named aside with two tabs and the placements count", async () => {
    const onTabChange = vi.fn();
    render(
      <OverlaysPanel
        tab="view"
        onTabChange={onTabChange}
        collapsed={false}
        onCollapsedChange={vi.fn()}
        placementsCount={4}
        view={<p>view body</p>}
        placements={<p>placements body</p>}
      />,
    );
    expect(screen.getByRole("complementary", { name: "Overlays" })).toBeInTheDocument();
    expect(screen.getByText("view body")).toBeInTheDocument();
    expect(screen.queryByText("placements body")).toBeNull();
    await userEvent.click(screen.getByRole("tab", { name: "Placements (4)" }));
    expect(onTabChange).toHaveBeenCalledWith("placements");
  });

  it("shows the placements body when that tab is the active one", () => {
    render(
      <OverlaysPanel
        tab="placements"
        onTabChange={vi.fn()}
        collapsed={false}
        onCollapsedChange={vi.fn()}
        placementsCount={0}
        view={<p>view body</p>}
        placements={<p>placements body</p>}
      />,
    );
    expect(screen.getByText("placements body")).toBeInTheDocument();
    expect(screen.queryByText("view body")).toBeNull();
    expect(screen.getByRole("tab", { name: "Placements (0)" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("collapses into the rail and back", async () => {
    const onCollapsedChange = vi.fn();
    const { rerender } = render(
      <OverlaysPanel
        tab="view"
        onTabChange={vi.fn()}
        collapsed={false}
        onCollapsedChange={onCollapsedChange}
        placementsCount={4}
        view={null}
        placements={null}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Collapse Overlays panel" }));
    expect(onCollapsedChange).toHaveBeenCalledWith(true);
    rerender(
      <OverlaysPanel
        tab="view"
        onTabChange={vi.fn()}
        collapsed
        onCollapsedChange={onCollapsedChange}
        placementsCount={4}
        view={null}
        placements={null}
      />,
    );
    expect(screen.queryByRole("complementary")).toBeNull();
    expect(screen.getByText("4 placed")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Expand Overlays panel" }));
    expect(onCollapsedChange).toHaveBeenCalledWith(false);
  });

  it("hands the page a width to offset against, in both states", () => {
    const { container, rerender } = render(
      <OverlaysPanel
        tab="view"
        onTabChange={vi.fn()}
        collapsed={false}
        onCollapsedChange={vi.fn()}
        placementsCount={1}
        view={null}
        placements={null}
      />,
    );
    const open = container.firstElementChild as HTMLElement;
    expect(open.className).toBe(overlaysWidthClass(false));

    rerender(
      <OverlaysPanel
        tab="view"
        onTabChange={vi.fn()}
        collapsed
        onCollapsedChange={vi.fn()}
        placementsCount={1}
        view={null}
        placements={null}
      />,
    );
    expect((container.firstElementChild as HTMLElement).className).toBe(overlaysWidthClass(true));
  });

  // The onboarding step explains the two tabs, and the overlay measures the
  // halo off whatever carries the attribute — so it has to be the strip inside
  // the aside, not a wrapper around a panel whose own box is zero-height.
  it("anchors a tour step on the tabs strip itself", () => {
    const { container } = render(
      <OverlaysPanel
        tab="view"
        onTabChange={vi.fn()}
        collapsed={false}
        onCollapsedChange={vi.fn()}
        placementsCount={0}
        tourId="overlays-tabs"
        view={<p>view body</p>}
        placements={<p>placements body</p>}
      />,
    );
    const anchor = container.querySelector('[data-tour="overlays-tabs"]');
    expect(anchor).not.toBeNull();
    expect(anchor).toContainElement(screen.getByRole("tablist"));
    expect(screen.getByRole("complementary", { name: "Overlays" })).toContainElement(
      anchor as HTMLElement,
    );
  });

  it("emits no anchor attribute when no tour step points here", () => {
    const { container } = render(
      <OverlaysPanel
        tab="view"
        onTabChange={vi.fn()}
        collapsed={false}
        onCollapsedChange={vi.fn()}
        placementsCount={0}
        view={<p>view body</p>}
        placements={<p>placements body</p>}
      />,
    );
    expect(container.querySelector("[data-tour]")).toBeNull();
  });
});