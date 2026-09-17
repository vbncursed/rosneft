import { fireEvent, render, screen } from "@testing-library/react";
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

  it("is a tabpanel the active tab controls, and it can be scrolled from the keyboard", () => {
    render(
      <OverlaysPanel
        tab="placements"
        onTabChange={vi.fn()}
        collapsed={false}
        onCollapsedChange={vi.fn()}
        placementsCount={4}
        view={<p>view body</p>}
        placements={<p>placements body</p>}
      />,
    );
    const body = screen.getByRole("tabpanel", { name: "Placements (4)" });
    expect(body).toContainElement(screen.getByText("placements body"));
    // The body scrolls; without a tabindex a keyboard reader cannot reach a
    // long placements list at all.
    expect(body).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("tab", { name: "Placements (4)" })).toHaveAttribute(
      "aria-controls",
      body.id,
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

  // N23: the fold must not teleport. Both faces enter from 8px to the right
  // and fade in; under reduced motion only the fade is left. Exit is instant.
  it("brings the panel and the rail in with a short slide and fade", () => {
    const entering = [
      "transition-[opacity,translate]",
      "duration-200",
      "ease-out",
      "starting:opacity-0",
      "motion-safe:starting:translate-x-2",
    ];
    const at = (collapsed: boolean) => (
      <OverlaysPanel
        tab="view"
        onTabChange={vi.fn()}
        collapsed={collapsed}
        onCollapsedChange={vi.fn()}
        placementsCount={1}
        view={null}
        placements={null}
      />
    );
    const { rerender } = render(at(false));
    expect(screen.getByRole("complementary", { name: "Overlays" })).toHaveClass(...entering);
    rerender(at(true));
    const rail = screen.getByRole("button", { name: "Expand Overlays panel" }).parentElement;
    expect(rail).toHaveClass(...entering);
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

describe("OverlaysPanel · the scrolled indicator", () => {
  const panel = () =>
    render(
      <OverlaysPanel
        tab="view"
        onTabChange={vi.fn()}
        collapsed={false}
        onCollapsedChange={vi.fn()}
        placementsCount={2}
        view={<p>view body</p>}
        placements={<p>placements body</p>}
      />,
    );

  const body = () => screen.getByRole("tabpanel");

  it("says the metadata is above once the body has been scrolled off the top", () => {
    panel();
    expect(screen.queryByText("scrolled · metadata above")).not.toBeInTheDocument();

    fireEvent.scroll(body(), { target: { scrollTop: 40 } });
    expect(screen.getByText("scrolled · metadata above")).toBeInTheDocument();
  });

  it("takes the strip away again at the top of the list", () => {
    panel();
    fireEvent.scroll(body(), { target: { scrollTop: 40 } });
    fireEvent.scroll(body(), { target: { scrollTop: 0 } });
    expect(screen.queryByText("scrolled · metadata above")).not.toBeInTheDocument();
  });

  // Mock state 9. Inserted into the flow, the strip pushed the body down 26px
  // on the first pixel of a scroll and back up at the top — a layout shift in
  // answer to a gesture. It lies over the body instead, and fades in.
  it("lies over the body rather than pushing it down, and fades in", () => {
    panel();
    fireEvent.scroll(body(), { target: { scrollTop: 40 } });
    const strip = screen.getByText("scrolled · metadata above");
    expect(strip).toHaveClass("absolute", "inset-x-0", "top-0", "text-muted");
    expect(strip).toHaveClass("transition-opacity", "starting:opacity-0");
    expect(strip).not.toHaveClass("text-dim");
    expect(strip.parentElement).toBe(body().parentElement);
    expect(strip.parentElement).toHaveClass("relative");
    // Focus scrolled to the top of the body lands below the strip, not under it.
    expect(body()).toHaveClass("scroll-pt-[26px]");
  });

  it("gives the collapse button press feedback", () => {
    panel();
    expect(screen.getByRole("button", { name: "Collapse Overlays panel" })).toHaveClass(
      "active:scale-95",
      "ease-out",
    );
  });
});
