import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ModeChip } from "./mode-chip";

describe("ModeChip", () => {
  it("renders its text as a named status line", () => {
    render(<ModeChip label="Pointer mode">orbit · drag to rotate</ModeChip>);
    expect(screen.getByRole("status", { name: "Pointer mode" })).toHaveTextContent(
      "orbit · drag to rotate",
    );
  });
  it("is plain text without a name — an unnamed live region announces from nowhere", () => {
    render(<ModeChip>coarse LOD 2 shown · LOD 0 62%</ModeChip>);
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByText("coarse LOD 2 shown · LOD 0 62%")).toBeInTheDocument();
  });
  it("draws the kbd after the text", () => {
    render(<ModeChip label="Panorama mode" kbd="P">panorama · next</ModeChip>);
    expect(screen.getByRole("status").querySelector("kbd")).toHaveTextContent("P");
  });
  it("marks the spinning variant busy", () => {
    render(<ModeChip label="Loading" spinning icon="refresh">Loading model</ModeChip>);
    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
  });
});
