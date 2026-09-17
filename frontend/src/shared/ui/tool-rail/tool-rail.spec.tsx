import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ToolRail } from "./tool-rail";

const tools = (onReset = vi.fn(), onMeasure = vi.fn()) => [
  { key: "reset", glyph: "↺", name: "Reset camera", state: "active" as const, onClick: onReset },
  { key: "measure", glyph: "↔", name: "Measure (M)", toggle: true, onClick: onMeasure },
  { key: "tour", glyph: "▶", name: "Replay guided tour", state: "inert" as const, onClick: vi.fn() },
];

describe("ToolRail", () => {
  it("is a named toolbar of named buttons", () => {
    render(<ToolRail label="Viewer tools" tools={tools()} />);
    const bar = screen.getByRole("toolbar", { name: "Viewer tools" });
    expect(bar.querySelectorAll("button")).toHaveLength(3);
    // aria-pressed on the mode tile only: Reset camera happens once when
    // pressed, and a toggle that stays on says the camera is still being reset.
    expect(screen.getByRole("button", { name: "Reset camera" })).not.toHaveAttribute("aria-pressed");
    expect(screen.getByRole("button", { name: "Measure (M)" })).toHaveAttribute("aria-pressed", "false");
  });

  it("marks an inert tool disabled without removing it, and swallows its click", async () => {
    const t = tools();
    render(<ToolRail label="Viewer tools" tools={t} />);
    const tour = screen.getByRole("button", { name: "Replay guided tour" });
    expect(tour).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(tour);
    expect(t[2].onClick).not.toHaveBeenCalled();
  });

  // Kept in place so the rail never shifts, but a tile that does nothing on
  // Enter has no business in the Tab order.
  it("takes an inert tile out of the Tab order and leaves the live ones in it", () => {
    render(<ToolRail label="Viewer tools" tools={tools()} />);
    expect(screen.getByRole("button", { name: "Replay guided tour" })).toHaveAttribute("tabindex", "-1");
    expect(screen.getByRole("button", { name: "Measure (M)" })).toHaveAttribute("tabindex", "0");
  });

  // jsdom computes no styles: the press depth, its transition and the HUD's one
  // focus offset are pinned by their tokens. An inert tile does not press.
  it("presses a live 30px tile deeper than a control, and an inert one not at all", () => {
    render(<ToolRail label="Viewer tools" tools={tools()} />);
    const live = screen.getByRole("button", { name: "Measure (M)" }).className.split(/\s+/);
    expect(live).toEqual(
      expect.arrayContaining([
        "active:scale-95",
        "transition-[color,background-color,scale]",
        "ease-out",
        "focus-visible:outline-offset-2",
      ]),
    );
    expect(screen.getByRole("button", { name: "Replay guided tour" }).className).not.toContain("scale-95");
  });

  it("fires the tool's handler", async () => {
    const onMeasure = vi.fn();
    render(<ToolRail label="Viewer tools" tools={tools(vi.fn(), onMeasure)} />);
    await userEvent.click(screen.getByRole("button", { name: "Measure (M)" }));
    expect(onMeasure).toHaveBeenCalledOnce();
  });

  it("carries an onboarding anchor onto the tile itself, not a wrapper", () => {
    const { container } = render(
      <ToolRail
        label="Viewer tools"
        tools={[{ key: "measure", glyph: "↔", name: "Measure (M)", dataTour: "measure" }]}
      />,
    );
    expect(container.querySelector('[data-tour="measure"]')).toBe(
      screen.getByRole("button", { name: "Measure (M)" }),
    );
  });
});