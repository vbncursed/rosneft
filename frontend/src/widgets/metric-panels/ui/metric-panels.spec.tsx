import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MetricPanels, type MetricSection } from "./metric-panels";

const panel = (key: string, title: string) => ({
  key,
  title,
  meta: "ms",
  last: "452ms",
  series: [{ label: "p95", values: [1, 2, 3] }],
});

const SECTIONS: MetricSection[] = [
  { key: "traffic", title: "Traffic & latency", panels: [panel("latency", "Request latency"), panel("rps", "Requests")] },
  { key: "domain", title: "Domain", panels: [panel("conv", "Conversions")] },
];

describe("MetricPanels", () => {
  it("renders a labelled section per group", () => {
    render(<MetricPanels sections={SECTIONS} />);
    expect(screen.getByRole("region", { name: "Traffic & latency" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Domain" })).toBeInTheDocument();
  });

  it("counts the panels, agreeing in number", () => {
    render(<MetricPanels sections={SECTIONS} />);
    expect(screen.getByText("2 panels")).toBeInTheDocument();
    expect(screen.getByText("1 panel")).toBeInTheDocument();
  });

  it("renders one panel per entry", () => {
    render(<MetricPanels sections={SECTIONS} />);
    expect(screen.getAllByRole("article")).toHaveLength(3);
  });

  it("marks the selected panel", () => {
    render(<MetricPanels sections={SECTIONS} selectedKey="rps" />);
    expect(screen.getByRole("article", { name: "Requests" })).toHaveAttribute(
      "aria-current",
      "true",
    );
  });

  it("reports a selection by key", async () => {
    const onSelect = vi.fn();
    render(<MetricPanels sections={SECTIONS} onSelect={onSelect} />);
    await userEvent.click(screen.getByRole("article", { name: "Conversions" }));
    expect(onSelect).toHaveBeenCalledWith("conv");
  });

  it("hides a section the filter emptied", () => {
    render(<MetricPanels sections={[...SECTIONS, { key: "go", title: "Go runtime", panels: [] }]} />);
    expect(screen.queryByRole("region", { name: "Go runtime" })).not.toBeInTheDocument();
  });

  it("says the filter matched nothing rather than showing empty headings", () => {
    render(<MetricPanels sections={[{ key: "go", title: "Go runtime", panels: [] }]} />);
    expect(screen.getByText("No panels match this filter.")).toBeInTheDocument();
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });
});
