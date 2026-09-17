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

  // Inside a panorama the chip sits on a photograph: a 14% tint over whatever
  // the sky is reads at ~2:1. The tint is layered over an opaque panel ground,
  // as an image, so it never competes with the chip's own elevation shadow.
  it("lays the accent tint over an opaque panel ground", () => {
    render(<ModeChip label="Panorama mode">panorama · drag to look around</ModeChip>);
    const cls = screen.getByRole("status").className.split(/\s+/);
    expect(cls).toEqual(
      expect.arrayContaining(["bg-panel", "bg-[image:linear-gradient(var(--accent-soft),var(--accent-soft))]"]),
    );
    expect(cls).not.toContain("bg-accent-soft");
    expect(cls.filter((c) => c.startsWith("shadow-"))).toEqual(["shadow-elevation"]);
  });

  it("spins its icon at 700ms, and slowly rather than not at all under reduced motion", () => {
    render(<ModeChip label="Loading" spinning icon="refresh">Loading model</ModeChip>);
    const icon = screen.getByRole("status").querySelector("svg")!;
    const cls = (icon.getAttribute("class") ?? "").split(/\s+/);
    expect(cls).toEqual(
      expect.arrayContaining(["animate-spin", "[animation-duration:700ms]", "motion-reduce:[animation-duration:2s]"]),
    );
    expect(cls).not.toContain("motion-reduce:animate-none");
  });
});
