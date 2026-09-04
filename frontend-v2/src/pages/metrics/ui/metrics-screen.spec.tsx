import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PANELS, type PanelId } from "@/entities/metric";
import type { MetricsState } from "../model/use-metrics";
import type { PanelResult } from "../model/dashboard";
import { MetricsScreen } from "./metrics-screen";

const { useMetrics } = vi.hoisted(() => ({ useMetrics: vi.fn() }));
vi.mock("../model/use-metrics", () => ({ useMetrics }));

const navigate = vi.fn();
let search: { range: string } = { range: "1h" };

// A stand-in for the router context: the screen is rendered on its own, and
// only takes the range out of the URL and puts it back.
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigate,
  useSearch: () => search,
}));

const series = (label: string, ...values: number[]) => ({
  label,
  points: values.map((v, i) => ({ t: i, v })),
  labels: {},
});

const RESULTS = Object.fromEntries(
  (Object.keys(PANELS) as PanelId[]).map((id): [PanelId, PanelResult] => [
    id,
    { kind: "value", series: [series(id, 1, 2)] },
  ]),
) as Partial<Record<PanelId, PanelResult>>;

const state = (over: Partial<MetricsState> = {}): MetricsState => ({
  status: "ready",
  error: null,
  results: RESULTS,
  services: [
    { name: "gateway", state: "up", meta: "142/s", samples: [1, 2], latency: "18ms", errors: "0/s" },
    { name: "audit", state: "down", meta: "scrape failed", samples: [], latency: "—", errors: "—" },
  ],
  alerts: [
    {
      name: "TargetDown",
      meta: "audit · severity: critical",
      state: "firing",
      service: "audit",
      severity: "critical",
    },
  ],
  firingCount: 1,
  query: "",
  setQuery: vi.fn(),
  selectedService: null,
  selectService: vi.fn(),
  selectedPanel: null,
  selectPanel: vi.fn(),
  alertOpen: true,
  setAlertOpen: vi.fn(),
  ...over,
});

beforeEach(() => {
  useMetrics.mockReset();
  navigate.mockReset();
  search = { range: "1h" };
});

describe("MetricsScreen", () => {
  it("shows a skeleton while loading and the gateway's sentence when unavailable", () => {
    useMetrics.mockReturnValue(state({ status: "loading", results: {} }));
    const { unmount } = render(<MetricsScreen />);
    expect(screen.getByRole("status", { name: "Loading dashboard" })).toBeInTheDocument();
    unmount();

    useMetrics.mockReturnValue(
      state({ status: "unavailable", results: {}, error: "Prometheus unreachable" }),
    );
    render(<MetricsScreen />);
    expect(screen.getByRole("alert")).toHaveTextContent("Prometheus unreachable");
  });

  it("lists every scraped service, every section and the four headline tiles", () => {
    useMetrics.mockReturnValue(state());
    render(<MetricsScreen />);

    expect(screen.getByRole("article", { name: "gateway" })).toBeInTheDocument();
    expect(screen.getByRole("article", { name: "audit" })).toBeInTheDocument();
    for (const title of ["Services (RED)", "Domain", "Go runtime"]) {
      expect(screen.getByRole("region", { name: title })).toBeInTheDocument();
    }
    for (const label of ["Requests: 2/s", "Errors: 200%", "p99: 2s", "Queue: 2"]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
    // Services are counted by the meter, not by a tile: stat-up counts scrape
    // targets, and a tile printing that over service names read "12 of 11".
    expect(screen.queryByLabelText(/^Up: /)).not.toBeInTheDocument();
    expect(screen.queryByText(/scraped targets/)).not.toBeInTheDocument();
  });

  it("meters service health in the wide slot, counting what is up", () => {
    useMetrics.mockReturnValue(
      state({
        services: [
          { name: "gateway", state: "up", meta: "", samples: [], latency: "—", errors: "—" },
          { name: "auth", state: "up", meta: "", samples: [], latency: "—", errors: "—" },
          { name: "audit", state: "down", meta: "", samples: [], latency: "—", errors: "—" },
        ],
      }),
    );
    render(<MetricsScreen />);
    expect(screen.getByRole("img", { name: /Service health/ })).toBeInTheDocument();
    expect(screen.getByText("2 of 3 up")).toBeInTheDocument();
    expect(screen.getByText("2 of 3 up").className).toContain("text-warn");
  });

  it("calls every service up without a warning when every service is", () => {
    useMetrics.mockReturnValue(
      state({
        services: [
          { name: "gateway", state: "up", meta: "", samples: [], latency: "—", errors: "—" },
        ],
      }),
    );
    render(<MetricsScreen />);
    expect(screen.getByText("1 of 1 up").className).toContain("text-ok");
  });

  it("narrows a per-service panel to the selected service", () => {
    const named = (name: string, v: number) => ({
      label: name,
      labels: { service: name },
      points: [{ t: 0, v }],
    });
    const many = {
      kind: "value" as const,
      series: [named("gateway", 1), named("mesh", 2), named("auth", 3), named("audit", 4)],
    };
    useMetrics.mockReturnValue(
      state({ selectedService: "mesh", results: { ...RESULTS, "runtime-memory": many } }),
    );
    render(<MetricsScreen />);
    const panel = screen.getByRole("article", { name: "Resident memory" });
    expect(panel).toHaveTextContent("mesh");
    // Not merely the three loudest — "audit" leads on last value and is gone.
    expect(panel).not.toHaveTextContent("audit");
    expect(panel).not.toHaveTextContent("gateway");
  });

  it("counts what is firing", () => {
    useMetrics.mockReturnValue(state());
    render(<MetricsScreen />);
    expect(screen.getByText(/1 alert$/)).toBeInTheDocument();
  });

  it("puts the range in the URL, on the route the reader is already on", async () => {
    useMetrics.mockReturnValue(state());
    render(<MetricsScreen />);
    expect(screen.getByRole("radio", { name: "1h" })).toBeChecked();

    await userEvent.click(screen.getByRole("radio", { name: "6h" }));
    expect(navigate).toHaveBeenCalledWith({ to: ".", search: { range: "6h" } });
  });

  it("reads the range back out of the URL", () => {
    search = { range: "24h" };
    useMetrics.mockReturnValue(state());
    render(<MetricsScreen />);
    expect(useMetrics).toHaveBeenCalledWith("24h");
    expect(screen.getByRole("radio", { name: "24h" })).toBeChecked();
  });

  it("narrows the health list and the panels through the filter", () => {
    useMetrics.mockReturnValue(state({ query: "service:gate group:red" }));
    render(<MetricsScreen />);

    expect(screen.getByRole("article", { name: "gateway" })).toBeInTheDocument();
    expect(screen.queryByRole("article", { name: "audit" })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Services (RED)" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Go runtime" })).not.toBeInTheDocument();
  });

  it("searches panel titles by free text", () => {
    useMetrics.mockReturnValue(state({ query: "latency" }));
    render(<MetricsScreen />);
    expect(screen.getByRole("article", { name: "Latency p99 by service" })).toBeInTheDocument();
    expect(screen.queryByRole("article", { name: "Requests by service" })).not.toBeInTheDocument();
  });

  it("opens the firing alert with its facts, and closes it", async () => {
    const s = state();
    useMetrics.mockReturnValue(s);
    const { rerender } = render(<MetricsScreen />);

    const panel = screen.getByRole("complementary", { name: "Alert: TargetDown" });
    for (const value of ["TargetDown", "audit", "critical", "firing"]) {
      expect(panel).toHaveTextContent(value);
    }
    expect(screen.queryByRole("button", { name: "Silence 1h" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(s.setAlertOpen).toHaveBeenCalledWith(false);

    useMetrics.mockReturnValue(state({ alertOpen: false }));
    rerender(<MetricsScreen />);
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
  });

  it("counts no denominator it does not have, and opens no inspector for a pending alert", () => {
    useMetrics.mockReturnValue(
      state({
        services: [],
        results: {},
        firingCount: 0,
        alerts: [
          { name: "TargetDown", meta: "audit", state: "pending", service: "audit", severity: "" },
        ],
      }),
    );
    render(<MetricsScreen />);

    expect(screen.getByText("0 of 0 up")).toBeInTheDocument();
    expect(screen.getByLabelText("Requests: loading")).toBeInTheDocument();
    expect(screen.queryByText(/alert$/)).not.toBeInTheDocument();
    // The inspector's header is an unconditional red "Firing" — a pending
    // alert underneath it would be a lie, so it is not drawn.
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
  });

  it("says the alert count is unknown rather than drawing a confident zero", () => {
    useMetrics.mockReturnValue(
      state({
        alerts: [],
        firingCount: null,
        results: { ...RESULTS, alerts: { kind: "unavailable", message: "Prometheus unreachable" } },
      }),
    );
    render(<MetricsScreen />);
    expect(screen.getByText("alerts unavailable")).toBeInTheDocument();
    expect(screen.queryByText(/alerts$/)).not.toBeInTheDocument();
  });

  it("blames the failed services-up panel, not a filter the reader did not apply", () => {
    useMetrics.mockReturnValue(
      state({
        services: [],
        results: {
          ...RESULTS,
          "services-up": { kind: "unavailable", message: "Prometheus unreachable" },
        },
      }),
    );
    render(<MetricsScreen />);
    expect(
      screen.getByText("Service health is unavailable: Prometheus unreachable"),
    ).toBeInTheDocument();
    expect(screen.queryByText("No services match this filter.")).not.toBeInTheDocument();
    expect(screen.queryByText(/Loosen the filter/)).not.toBeInTheDocument();
  });

  it("marks a failed panel unavailable instead of blanking the dashboard", () => {
    useMetrics.mockReturnValue(
      state({
        results: { ...RESULTS, "red-http": { kind: "unavailable", message: "Prometheus unreachable" } },
      }),
    );
    render(<MetricsScreen />);
    const panel = screen.getByRole("article", { name: "HTTP requests" });
    expect(panel).toHaveTextContent("unavailable — Prometheus unreachable");
    expect(screen.getByRole("region", { name: "Services (RED)" })).toBeInTheDocument();
  });
});
