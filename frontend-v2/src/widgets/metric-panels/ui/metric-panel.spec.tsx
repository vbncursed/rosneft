import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MetricPanel } from "./metric-panel";
import type { Series } from "@/shared/ui/line-chart";

const SERIES: Series[] = [
  { label: "p95", values: [10, 20, 30] },
  { label: "p99", values: [40, 50, 60], tone: "bad" },
];

describe("MetricPanel", () => {
  it("names the panel, what it plots and the latest reading", () => {
    render(
      <MetricPanel title="Request latency" meta="p50 / p95 / p99 · ms" last="452ms" series={SERIES} />,
    );
    expect(screen.getByText("Request latency")).toBeInTheDocument();
    expect(screen.getByText("p50 / p95 / p99 · ms")).toBeInTheDocument();
    expect(screen.getByText("452ms")).toBeInTheDocument();
  });

  it("tones the latest reading", () => {
    const { rerender } = render(
      <MetricPanel title="Errors" meta="rps" last="1.6/s" lastTone="bad" series={SERIES} />,
    );
    expect(screen.getByText("1.6/s").className).toContain("text-bad");

    // A quiet panel is dim, not red: nothing happened is not a failure.
    rerender(<MetricPanel title="Errors" meta="no gRPC traffic in range" last="—" lastTone="dim" series={[]} />);
    expect(screen.getByText("—").className).toContain("text-dim");
  });

  it("plots the series and names every one in the legend, formatted by the panel's own unit", () => {
    render(
      <MetricPanel title="Request latency" meta="ms" last="452ms" series={SERIES} unit="seconds" />,
    );
    expect(
      screen.getByRole("img", { name: "Request latency: p95 30s, p99 60s" }),
    ).toBeInTheDocument();
    expect(screen.getByText("p95")).toBeInTheDocument();
    expect(screen.getByText("p99")).toBeInTheDocument();
  });

  it("marks the selected panel as current", () => {
    const { rerender } = render(
      <MetricPanel title="Request latency" meta="ms" last="452ms" series={SERIES} />,
    );
    expect(screen.getByRole("article")).not.toHaveAttribute("aria-current");

    rerender(
      <MetricPanel title="Request latency" meta="ms" last="452ms" series={SERIES} selected />,
    );
    expect(screen.getByRole("article")).toHaveAttribute("aria-current", "true");
  });

  it("selects on click", async () => {
    const onSelect = vi.fn();
    render(
      <MetricPanel title="Request latency" meta="ms" last="452ms" series={SERIES} onSelect={onSelect} />,
    );
    await userEvent.click(screen.getByRole("article", { name: "Request latency" }));
    expect(onSelect).toHaveBeenCalledOnce();
  });
});
