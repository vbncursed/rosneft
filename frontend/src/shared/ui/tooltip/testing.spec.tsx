import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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
});
