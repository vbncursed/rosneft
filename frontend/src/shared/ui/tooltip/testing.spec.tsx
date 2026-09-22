import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Tooltip } from "./tooltip";
import { focusTip, hoverTip } from "./testing";

describe("tooltip test helpers", () => {
  it("opens a tooltip by a resting hover", () => {
    render(
      <Tooltip label="Close">
        <button type="button">x</button>
      </Tooltip>,
    );
    expect(hoverTip(screen.getByRole("button"))).toHaveTextContent("Close");
  });

  it("opens a tooltip by a keyboard focus, at once", () => {
    render(
      <Tooltip label="Close">
        <button type="button">x</button>
      </Tooltip>,
    );
    expect(focusTip(screen.getByRole("button"))).toHaveTextContent("Close");
  });

  it("leaves a caller's fake timers on", () => {
    vi.useFakeTimers();
    render(
      <Tooltip label="Close">
        <button type="button">x</button>
      </Tooltip>,
    );
    hoverTip(screen.getByRole("button"));
    expect(vi.isFakeTimers()).toBe(true);
    vi.useRealTimers();
  });
});
