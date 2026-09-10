import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ModeChip } from "./mode-chip";

describe("ModeChip", () => {
  it("renders its text as a status line", () => {
    render(<ModeChip>orbit · drag to rotate</ModeChip>);
    expect(screen.getByRole("status")).toHaveTextContent("orbit · drag to rotate");
  });
  it("draws the kbd after the text", () => {
    render(<ModeChip kbd="P">panorama · next</ModeChip>);
    expect(screen.getByRole("status").querySelector("kbd")).toHaveTextContent("P");
  });
  it("marks the spinning variant busy", () => {
    render(<ModeChip spinning icon="refresh">Loading model</ModeChip>);
    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
  });
});
