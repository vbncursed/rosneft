import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ToolRail } from "./tool-rail";

const tools = (onReset = vi.fn(), onMeasure = vi.fn()) => [
  { key: "reset", glyph: "↺", name: "Reset camera", state: "active" as const, onClick: onReset },
  { key: "measure", glyph: "↔", name: "Measure (M)", onClick: onMeasure },
  { key: "tour", glyph: "▶", name: "Replay guided tour", state: "inert" as const, onClick: vi.fn() },
];

describe("ToolRail", () => {
  it("is a named toolbar of named buttons", () => {
    render(<ToolRail label="Viewer tools" tools={tools()} />);
    const bar = screen.getByRole("toolbar", { name: "Viewer tools" });
    expect(bar.querySelectorAll("button")).toHaveLength(3);
    expect(screen.getByRole("button", { name: "Reset camera" })).toHaveAttribute("aria-pressed", "true");
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

  it("fires the tool's handler", async () => {
    const onMeasure = vi.fn();
    render(<ToolRail label="Viewer tools" tools={tools(vi.fn(), onMeasure)} />);
    await userEvent.click(screen.getByRole("button", { name: "Measure (M)" }));
    expect(onMeasure).toHaveBeenCalledOnce();
  });
});
