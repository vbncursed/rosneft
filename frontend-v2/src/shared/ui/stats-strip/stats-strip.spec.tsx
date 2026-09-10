import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatsStrip } from "./stats-strip";

describe("StatsStrip", () => {
  it("reads every item as one status line", () => {
    render(<StatsStrip items={["36.0 × 24.0 × 8.5 m", "1 284 210 vertices", "LOD 1 active"]} />);
    const strip = screen.getByRole("status", { name: "Scene stats" });
    expect(strip).toHaveTextContent("36.0 × 24.0 × 8.5 m");
    expect(strip).toHaveTextContent("LOD 1 active");
    expect(strip.querySelectorAll("span")).toHaveLength(3);
  });

  it("marks the bad tone as an alert", () => {
    render(<StatsStrip tone="bad" items={["no geometry loaded", "vertices —"]} />);
    expect(screen.getByRole("alert")).toHaveTextContent("no geometry loaded");
  });
});
