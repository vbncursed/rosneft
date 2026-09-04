import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MetricsPage, type MetricsPageProps } from "./metrics-page";
import type { ServiceHealth } from "@/entities/metric";
import type { FiringAlert } from "@/widgets/alert-inspector";

const service = (name: string, over: Partial<ServiceHealth> = {}): ServiceHealth => ({
  name,
  state: "up",
  meta: "142 rps",
  samples: [1, 2, 3],
  latency: "18ms",
  errors: "0.1/s",
  ...over,
});

const alert: FiringAlert = {
  name: "HighErrorRate",
  meta: "gateway · severity: critical",
  firingFor: "14m",
  details: [{ label: "value", value: "0.82%", tone: "bad" }],
  series: { label: "5xx", values: [0.2, 0.8], tone: "bad" },
  threshold: { share: 45, label: "0.5%" },
  contributors: [{ path: "GET /api/territories/:slug", value: "412", share: 100 }],
};

const props = (over: Partial<MetricsPageProps> = {}): MetricsPageProps => ({
  services: [service("gateway", { state: "degraded" }), service("audit-service", { state: "down" })],
  sections: [
    {
      key: "traffic",
      title: "Traffic & latency",
      panels: [
        { key: "latency", title: "Request latency", meta: "ms", last: "452ms", series: [{ label: "p95", values: [1, 2] }] },
      ],
    },
  ],
  budget: {
    label: "SLO budget · 30d",
    detail: "64% left",
    detailTone: "warn",
    segments: [
      { tone: "warn", value: 36, label: "consumed" },
      { tone: "ok", value: 60, label: "remaining" },
    ],
  },
  stats: [
    { label: "Requests/sec", value: "142/s", hint: "gateway", delta: "+8%", deltaTone: "ok" },
    { label: "Error rate", value: "0.82%", hint: "SLO 0.5% breached", tone: "bad", delta: "+0.3", deltaTone: "bad" },
    { label: "p99 latency", value: "452ms", hint: "SLO 600ms", tone: "accent", delta: "−12%", deltaTone: "ok" },
  ],
  range: "6h",
  onRangeChange: vi.fn(),
  query: "",
  onQueryChange: vi.fn(),
  selectedService: null,
  onSelectService: vi.fn(),
  selectedPanel: null,
  onSelectPanel: vi.fn(),
  onCloseAlert: vi.fn(),
  onSilence: vi.fn(),
  onOpenInAudit: vi.fn(),
  onCopyPromQl: vi.fn(),
  ...over,
});

describe("MetricsPage", () => {
  it("names the page with one h1", () => {
    render(<MetricsPage {...props()} />);
    expect(screen.getByRole("heading", { level: 1, name: "Metrics" })).toBeInTheDocument();
    expect(screen.getByText("Prometheus · scrape 15s")).toBeInTheDocument();
  });

  it("draws no chrome of its own — the layout owns the column", () => {
    render(<MetricsPage {...props()} />);
    expect(screen.queryByRole("navigation", { name: "Console" })).not.toBeInTheDocument();
    expect(screen.queryByRole("main")).not.toBeInTheDocument();
  });

  it("counts firing alerts, agreeing in number, and stays quiet at zero", () => {
    const { rerender } = render(<MetricsPage {...props()} />);
    expect(screen.queryByText(/alert/)).not.toBeInTheDocument();

    rerender(<MetricsPage {...props({ firingCount: 1 })} />);
    expect(screen.getByText(/1 alert$/)).toBeInTheDocument();

    rerender(<MetricsPage {...props({ firingCount: 2 })} />);
    expect(screen.getByText(/2 alerts/)).toBeInTheDocument();
  });

  it("offers every range, with the current one chosen", () => {
    render(<MetricsPage {...props()} />);
    expect(screen.getByRole("radiogroup", { name: "Time range" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "6h" })).toBeChecked();
  });

  it("changes the range", async () => {
    const onRangeChange = vi.fn();
    render(<MetricsPage {...props({ onRangeChange })} />);
    await userEvent.click(screen.getByRole("radio", { name: "24h" }));
    expect(onRangeChange).toHaveBeenCalledWith("24h");
  });

  it("summarises the budget and the headline numbers", () => {
    render(<MetricsPage {...props()} />);
    expect(screen.getByText("64% left")).toBeInTheDocument();
    expect(screen.getByLabelText("Error rate: 0.82%").className).toContain("text-bad");
    expect(screen.getByText("+8%").className).toContain("text-ok");
  });

  it("lists the services and the panels", () => {
    render(<MetricsPage {...props()} />);
    expect(screen.getByRole("region", { name: "Service health" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Traffic & latency" })).toBeInTheDocument();
  });

  it("selects a service and a panel", async () => {
    const onSelectService = vi.fn();
    const onSelectPanel = vi.fn();
    render(<MetricsPage {...props({ onSelectService, onSelectPanel })} />);

    await userEvent.click(screen.getByRole("article", { name: "gateway" }));
    expect(onSelectService).toHaveBeenCalledWith("gateway");

    await userEvent.click(screen.getByRole("article", { name: "Request latency" }));
    expect(onSelectPanel).toHaveBeenCalledWith("latency");
  });

  it("keeps the alert panel out of the tree while nothing is firing", () => {
    render(<MetricsPage {...props()} />);
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
  });

  it("opens the alert panel when one is firing", () => {
    render(<MetricsPage {...props({ firingCount: 2, alert })} />);
    expect(screen.getByRole("complementary", { name: "Alert: HighErrorRate" })).toBeInTheDocument();
    expect(screen.getByText("Firing · 14m")).toBeInTheDocument();
  });

  it("acts on the firing alert", async () => {
    const p = props({ firingCount: 1, alert });
    render(<MetricsPage {...p} />);

    await userEvent.click(screen.getByRole("button", { name: "Silence 1h" }));
    await userEvent.click(screen.getByRole("button", { name: "Copy PromQL" }));
    expect(p.onSilence).toHaveBeenCalledOnce();
    expect(p.onCopyPromQl).toHaveBeenCalledOnce();
  });

  it("draws no coverage meter without a budget, and still shows the stat tiles", () => {
    render(<MetricsPage {...props({ budget: undefined })} />);
    expect(screen.queryByText("64% left")).not.toBeInTheDocument();
    expect(screen.getByText("Requests/sec")).toBeInTheDocument();
  });

  it("lays out five tiles without a budget — the grid is not cut to three", () => {
    const stats = ["Up", "Requests", "Errors", "p99", "Queue"].map((label) => ({
      label,
      value: "1",
      hint: "h",
    }));
    const { container } = render(<MetricsPage {...props({ budget: undefined, stats })} />);
    const grid = container.querySelector(".grid")!;
    expect(grid.className).toContain("lg:grid-cols-5");
    expect(grid.children).toHaveLength(5);
  });

  it("draws no button for a handler it was not given", () => {
    render(
      <MetricsPage
        {...props({
          firingCount: 1,
          alert,
          onSilence: undefined,
          onOpenInAudit: undefined,
          onCopyPromQl: undefined,
        })}
      />,
    );
    expect(screen.getByRole("complementary", { name: "Alert: HighErrorRate" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Silence 1h" })).not.toBeInTheDocument();
  });

  it("offers a filter example the health list can actually answer", () => {
    render(<MetricsPage {...props()} />);
    expect(screen.getByRole("textbox", { name: "Filter metrics" })).toHaveAttribute(
      "placeholder",
      "filter: service:gateway group:red state:down",
    );
  });

  it("shows a chip for a key:value query", () => {
    render(<MetricsPage {...props({ query: "service:gateway" })} />);
    expect(
      screen.getByRole("button", { name: "Remove filter service:gateway" }),
    ).toBeInTheDocument();
  });
});
