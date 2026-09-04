import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ChartLegend, LineChart, type Series } from "./line-chart";

const SERIES: Series[] = [
  { label: "p95", values: [10, 20, 30] },
  { label: "p99", values: [40, 50, 60], tone: "bad" },
];

describe("LineChart", () => {
  it("summarises the latest reading of each series for a reader who cannot see it", () => {
    render(<LineChart series={SERIES} label="Request latency" unit="ms" />);
    expect(
      screen.getByRole("img", { name: "Request latency: p95 30 ms, p99 60 ms" }),
    ).toBeInTheDocument();
  });

  it("says so when there is nothing to draw", () => {
    render(<LineChart series={[]} label="Request latency" />);
    expect(screen.getByRole("img", { name: "Request latency: no data" })).toBeInTheDocument();
  });

  it("reads the last value a gap-ending series actually has", () => {
    render(<LineChart series={[{ label: "p95", values: [10, 20, null] }]} label="Latency" unit="ms" />);
    expect(screen.getByRole("img", { name: "Latency: p95 20 ms" })).toBeInTheDocument();
  });

  it("says a series that is all gaps has no data, rather than printing a zero", () => {
    render(<LineChart series={[{ label: "p95", values: [null, null] }]} label="Latency" unit="ms" />);
    expect(screen.getByRole("img", { name: "Latency: p95 no data" })).toBeInTheDocument();
  });

  it("draws one line per series", () => {
    const { container } = render(<LineChart series={SERIES} label="l" />);
    expect(container.querySelectorAll("path[stroke]:not([stroke='none'])")).toHaveLength(2);
  });

  it("fills a lone series, and leaves several as lines so they do not hide each other", () => {
    const { container, rerender } = render(
      <LineChart series={[SERIES[0]]} label="l" />,
    );
    expect(container.querySelectorAll("path[stroke='none']")).toHaveLength(1);

    rerender(<LineChart series={SERIES} label="l" />);
    expect(container.querySelectorAll("path[stroke='none']")).toHaveLength(0);
  });

  it("scales every series against one maximum, so they stay comparable", () => {
    const { container } = render(<LineChart series={SERIES} label="l" />);
    const [first, second] = [...container.querySelectorAll("path[stroke]:not([stroke='none'])")];
    // p95 tops out at 30 of a shared 60, so its line never reaches the top.
    expect(first.getAttribute("d")).not.toContain(" 12.0");
    expect(second.getAttribute("d")).toContain(" 12.0");
  });

  // Two replicas of one service scrape as two series under the same label, so
  // the label cannot be the React key — that pair silently collapsed into one
  // line on the live dashboard.
  it("draws both series when two share a label", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { container } = render(
      <LineChart
        series={[
          { label: "mesh-worker", values: [1, 2] },
          { label: "mesh-worker", values: [3, 4] },
        ]}
        label="Resident memory"
      />,
    );
    expect(container.querySelectorAll("path[stroke]:not([stroke='none'])")).toHaveLength(2);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("dashes a reference series and draws it thinner", () => {
    const { container } = render(
      <LineChart series={[{ label: "p50", values: [1, 2], dashed: true }]} label="l" />,
    );
    const line = container.querySelector("path[stroke]:not([stroke='none'])")!;
    expect(line.getAttribute("stroke-dasharray")).toBe("4 4");
    expect(line.getAttribute("stroke-width")).toBe("1.3");
  });

  it("keeps the stroke width constant however the chart is stretched", () => {
    const { container } = render(<LineChart series={SERIES} label="l" />);
    expect(container.querySelector("path[stroke]")).toHaveAttribute(
      "vector-effect",
      "non-scaling-stroke",
    );
  });
});

describe("ChartLegend", () => {
  it("names every series beside its swatch", () => {
    render(<ChartLegend series={SERIES} />);
    expect(screen.getByText("p95")).toBeInTheDocument();
    expect(screen.getByText("p99")).toBeInTheDocument();
  });

  it("names both replicas when two series share a label", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<ChartLegend series={[{ label: "mesh-worker", values: [1] }, { label: "mesh-worker", values: [2] }]} />);
    expect(screen.getAllByText("mesh-worker")).toHaveLength(2);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("keeps the swatches decorative — the label carries the identity", () => {
    const { container } = render(<ChartLegend series={SERIES} />);
    expect(container.querySelectorAll("span[aria-hidden]")).toHaveLength(2);
  });
});
