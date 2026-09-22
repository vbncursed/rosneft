import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { focusTip, hoverTip } from "./testing";
import { Tooltip } from "./tooltip";
import { resetTooltipWarmup } from "./use-tooltip";

// The page's own Esc — the viewer leaving measure mode — listens on document.
const page = vi.fn((event: KeyboardEvent) => event.key);
const escapes = () => page.mock.results.filter((r) => r.value === "Escape").length;
beforeEach(() => {
  resetTooltipWarmup();
  page.mockReset();
  document.addEventListener("keydown", page);
});
afterEach(() => document.removeEventListener("keydown", page));

function renderOne() {
  render(
    <Tooltip label="Measure">
      <button aria-label="Measure" />
    </Tooltip>,
  );
  return screen.getByRole("button", { name: "Measure" });
}

describe("Tooltip · Esc and activation", () => {
  it.each(["Enter", " "])("closes when %j activates the trigger from the keyboard", (key) => {
    const b = renderOne();
    expect(focusTip(b)).toBeInTheDocument();
    fireEvent.keyDown(b, { key });
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("lets Esc reach the page when the tooltip opened on hover, and closes it", () => {
    const b = renderOne();
    expect(hoverTip(b)).toBeInTheDocument();
    const notCancelled = fireEvent.keyDown(b, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).toBeNull();
    expect(escapes()).toBe(1);
    expect(notCancelled).toBe(true);
  });

  it("keeps the first Esc when the tooltip opened on keyboard focus", () => {
    const b = renderOne();
    expect(focusTip(b)).toBeInTheDocument();
    fireEvent.keyDown(b, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).toBeNull();
    expect(escapes()).toBe(0);
  });

  it("Enter then Esc on a focused trigger reaches the page", () => {
    const b = renderOne();
    focusTip(b);
    fireEvent.keyDown(b, { key: "Enter" });
    fireEvent.keyDown(b, { key: "Escape" });
    expect(escapes()).toBe(1);
  });
});
