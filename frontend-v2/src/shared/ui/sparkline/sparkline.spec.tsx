import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Sparkline } from "./sparkline";

const VALUES = [12, 18, 9, 52, 41, 8];

describe("Sparkline", () => {
  it("labels the series and its note", () => {
    render(<Sparkline values={VALUES} label="Events" detail="peak 41/h" />);
    expect(screen.getByText("Events")).toBeInTheDocument();
    expect(screen.getByText("peak 41/h")).toBeInTheDocument();
  });

  it("summarises the shape for a reader who cannot see it", () => {
    render(<Sparkline values={VALUES} label="Events" />);
    expect(
      screen.getByRole("img", { name: "Events: 6 buckets, peak 52 events" }),
    ).toBeInTheDocument();
  });

  it("takes the unit it is given", () => {
    render(<Sparkline values={[3]} label="Errors" unit="failures" />);
    expect(screen.getByRole("img", { name: /peak 3 failures/ })).toBeInTheDocument();
  });

  it("says so when there is nothing to draw", () => {
    render(<Sparkline values={[]} label="Events" />);
    expect(screen.getByRole("img", { name: "Events: no data" })).toBeInTheDocument();
  });

  it("draws one bar per bucket, accenting the peak", () => {
    const { container } = render(<Sparkline values={VALUES} label="Events" />);
    const bars = [...container.querySelectorAll("[role='img'] > span")];
    expect(bars).toHaveLength(6);
    expect(bars.filter((b) => b.classList.contains("bg-accent"))).toHaveLength(1);
  });

  it("mutes the buckets still filling in", () => {
    const { container } = render(<Sparkline values={VALUES} label="Events" dimFrom={4} />);
    const bars = [...container.querySelectorAll("[role='img'] > span")];
    expect(bars.filter((b) => b.classList.contains("bg-line-2"))).toHaveLength(2);
  });

  it("keeps a zero bucket visible as a hairline rather than nothing at all", () => {
    const { container } = render(<Sparkline values={[0, 10]} label="Events" />);
    const bars = [...container.querySelectorAll("[role='img'] > span")];
    expect(bars[0].className).toContain("min-h-px");
  });
});
