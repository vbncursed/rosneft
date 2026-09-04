import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MetricsRange } from "@/entities/metric";
import { setCsrfToken } from "@/shared/api";
import { statsOf } from "./dashboard";
import { useMetrics } from "./use-metrics";

const PRINCIPAL = {
  id: "me",
  email: "root@x",
  username: "admin",
  status: "active",
  totpEnabled: false,
  totpRequired: false,
  passkeyEnabled: null,
  roleSlugs: [],
  roleTitles: {},
  permissions: [],
  isOwner: true,
  onboardingToursSeen: [],
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const points = (...values: number[]) => values.map((v, i) => ({ t: 1_700_000_000 + i * 15, v }));
const dto = (label: string, values: number[], labels: Record<string, string> = {}) => ({
  label,
  points: points(...values),
  labels,
});

const UNREACHABLE = { code: "unavailable", message: "Prometheus unreachable" };

const PANEL_BODY: Record<string, unknown[]> = {
  "services-up": [dto("gateway", [1, 1]), dto("audit", [1, 0])],
  "red-rate": [dto("gateway", [140, 142])],
  "red-errors": [dto("gateway", [0, 0])],
  "red-latency": [dto("gateway.Gateway", [0.018, 0.02])],
  alerts: [
    dto("TargetDown", [1], {
      alertname: "TargetDown",
      alertstate: "firing",
      service: "audit",
      severity: "critical",
    }),
  ],
};

let fetchMock: ReturnType<typeof vi.fn>;
let client: QueryClient;
let allFail = false;
let failing = new Set<string>();

const panelOf = (url: string) => new URL(url, "http://x").searchParams.get("panel") ?? "";
const rangeOf = (url: string) => new URL(url, "http://x").searchParams.get("range") ?? "";

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(["me"], PRINCIPAL);
  setCsrfToken("csrf");
  allFail = false;
  failing = new Set();
  fetchMock = vi.fn(async (url: string) => {
    if (allFail) return json(UNREACHABLE, 502);
    const panel = panelOf(url);
    if (panel === "stat-errors" || failing.has(panel)) return json(UNREACHABLE, 502);
    return json(PANEL_BODY[panel] ?? [dto(panel, [0.5, 1])]);
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  client.clear();
});

describe("useMetrics", () => {
  it("is loading, then ready with services, panels, stats and alerts", async () => {
    const { result } = renderHook(() => useMetrics("1h"), { wrapper });
    expect(result.current.status).toBe("loading");

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.services.map((s) => [s.name, s.state])).toEqual([
      ["gateway", "up"],
      ["audit", "down"],
    ]);
    expect(result.current.services[0].latency).toBe("20ms");
    expect(result.current.results["red-rate"]).toEqual({
      kind: "value",
      series: [{ label: "gateway", points: points(140, 142), labels: {} }],
    });
    expect(statsOf(result.current.results, 2)[0]).toEqual({
      label: "Up",
      value: "1",
      hint: "of 2 scraped targets",
    });
    expect(result.current.alerts).toEqual([
      {
        name: "TargetDown",
        meta: "audit · severity: critical",
        state: "firing",
        service: "audit",
        severity: "critical",
      },
    ]);
    expect(result.current.firingCount).toBe(1);
    expect(result.current.alertOpen).toBe(true);
  });

  it("keeps the screen ready when one panel fails, and marks that card", async () => {
    const { result } = renderHook(() => useMetrics("1h"), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("ready"));

    expect(result.current.error).toBeNull();
    expect(result.current.results["stat-errors"]).toEqual({
      kind: "unavailable",
      message: "Prometheus unreachable",
    });
    expect(statsOf(result.current.results, 2)[2].value).toBe("—");
  });

  it("does not count 0 firing when the alerts panel failed — it knows nothing", async () => {
    failing.add("alerts");
    const { result } = renderHook(() => useMetrics("1h"), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("ready"));

    expect(result.current.results.alerts).toEqual({
      kind: "unavailable",
      message: "Prometheus unreachable",
    });
    expect(result.current.alerts).toEqual([]);
    expect(result.current.firingCount).toBeNull();
  });

  it("is unavailable only when every panel failed", async () => {
    allFail = true;
    const { result } = renderHook(() => useMetrics("1h"), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("unavailable"));
    expect(result.current.error).toBe("Prometheus unreachable");
  });

  it("re-queries every panel on a range change", async () => {
    const { result, rerender } = renderHook(
      ({ range }: { range: MetricsRange }) => useMetrics(range),
      { wrapper, initialProps: { range: "1h" as MetricsRange } },
    );
    await waitFor(() => expect(result.current.status).toBe("ready"));
    const asked = (range: string) =>
      new Set(
        fetchMock.mock.calls
          .map(([url]) => url as string)
          .filter((url) => rangeOf(url) === range)
          .map(panelOf),
      );
    const hourly = asked("1h");
    expect(hourly.size).toBe(21);
    expect(asked("6h").size).toBe(0);

    rerender({ range: "6h" });
    await waitFor(() => expect(asked("6h")).toEqual(hourly));
  });

  it("narrows nothing by itself — the query is state the screen filters with", async () => {
    const { result } = renderHook(() => useMetrics("1h"), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    act(() => result.current.setQuery("service:gate"));
    expect(result.current.query).toBe("service:gate");
    expect(result.current.services).toHaveLength(2);
  });

  it("selects a service and a panel, and closes the alert", async () => {
    const { result } = renderHook(() => useMetrics("1h"), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("ready"));

    act(() => result.current.selectService("gateway"));
    act(() => result.current.selectPanel("red-rate"));
    expect(result.current.selectedService).toBe("gateway");
    expect(result.current.selectedPanel).toBe("red-rate");

    act(() => result.current.setAlertOpen(false));
    expect(result.current.alertOpen).toBe(false);
  });
});
