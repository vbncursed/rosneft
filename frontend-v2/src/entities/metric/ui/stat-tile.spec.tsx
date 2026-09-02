import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatTile } from "./stat-tile";

describe("StatTile", () => {
  it("shows the label and the reading", () => {
    render(<StatTile label="Req/s" state={{ kind: "value", value: "142" }} />);
    expect(screen.getByText("Req/s")).toBeInTheDocument();
    expect(screen.getByText("142")).toBeInTheDocument();
  });

  it("spells out a waiting tile, so the glyph is not the only cue", () => {
    render(<StatTile label="P95" state={{ kind: "loading" }} />);
    expect(screen.getByLabelText("P95: loading")).toHaveTextContent("…");
  });

  it("spells out an unavailable tile, so red is not the only cue", () => {
    render(<StatTile label="Error rate" state={{ kind: "unavailable" }} />);
    expect(screen.getByLabelText("Error rate: unavailable")).toHaveTextContent("—");
  });

  it("distinguishes waiting from failing — a spinner must not hide an outage", () => {
    const { rerender } = render(<StatTile label="P95" state={{ kind: "loading" }} />);
    expect(screen.getByLabelText("P95: loading").className).toContain("text-muted");

    rerender(<StatTile label="P95" state={{ kind: "unavailable" }} />);
    expect(screen.getByLabelText("P95: unavailable").className).toContain("text-bad");
  });
});
