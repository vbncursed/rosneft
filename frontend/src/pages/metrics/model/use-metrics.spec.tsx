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

const rangeOf = (url: string) => new URL(url, "http://x").searchParams.get("range") ?? "";
const panelsOf = (url: string) => new URL(url, "http://x").searchParams.getAll("panel");

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
    const answered = new URL(url, "http://x").searchParams
      .getAll("panel")
      .filter((panel) => panel !== "stat-errors" && !failing.has(panel));
    return json(Object.fromEntries(answered.map((p) => [p, PANEL_BODY[p] ?? [dto(p, [0.5, 1])]])));
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
    expect(statsOf(result.current.results)[0]).toEqual({
      label: "Requests",
      state: { kind: "value", value: "1/s" },
      hint: "per second · all HTTP",
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
      message: "Prometheus did not answer",
    });
    expect(statsOf(result.current.results)[1].state).toEqual({ kind: "unavailable" });
  });

  it("keeps the last dashboard on screen when a refetch fails — stale beats empty", async () => {
    const { result } = renderHook(() => useMetrics("1h"), { wrapper });
    await waitFor(() => expect(result.current.results["red-rate"]?.kind).toBe("value"));

    allFail = true;
    await act(() => client.refetchQueries({ queryKey: ["metrics", "1h"] }));

    // The refetch really happened and really failed — otherwise the assertion
    // below would pass just as well if the query key had drifted.
    expect(client.getQueryState(["metrics", "1h"])?.status).toBe("error");
    expect(result.current.status).toBe("ready");
    expect(result.current.results["red-rate"]).toEqual({
      kind: "value",
      series: [{ label: "gateway", points: points(140, 142), labels: {} }],
    });
  });

  // A transient single-panel failure must not flicker its card dark.
  it("keeps a panel's last series, marked stale, when one tick leaves it out", async () => {
    const { result } = renderHook(() => useMetrics("1h"), { wrapper });
    await waitFor(() => expect(result.current.results["red-rate"]?.kind).toBe("value"));

    failing.add("red-rate");
    await act(() => client.refetchQueries({ queryKey: ["metrics", "1h"] }));
    await waitFor(() =>
      expect(result.current.results["red-rate"]).toEqual({
        kind: "value",
        series: [{ label: "gateway", points: points(140, 142), labels: {} }],
        stale: true,
      }),
    );
    // Never answered at all: dark, not stale.
    expect(result.current.results["stat-errors"]?.kind).toBe("unavailable");

    failing.clear();
    await act(() => client.refetchQueries({ queryKey: ["metrics", "1h"] }));
    await waitFor(() => expect(result.current.results["red-rate"]).not.toHaveProperty("stale"));
  });

  it("does not carry one range's series into another", async () => {
    const { result, rerender } = renderHook(
      ({ range }: { range: MetricsRange }) => useMetrics(range),
      { wrapper, initialProps: { range: "1h" as MetricsRange } },
    );
    await waitFor(() => expect(result.current.results["red-rate"]?.kind).toBe("value"));
    failing.add("red-rate");
    rerender({ range: "6h" });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    await waitFor(() => expect(result.current.results["red-rate"]?.kind).toBe("unavailable"));
  });

  it("does not count 0 firing when the alerts panel failed — it knows nothing", async () => {
    failing.add("alerts");
    const { result } = renderHook(() => useMetrics("1h"), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("ready"));

    expect(result.current.results.alerts).toEqual({
      kind: "unavailable",
      message: "Prometheus did not answer",
    });
    expect(result.current.alerts).toEqual([]);
    expect(result.current.firingCount).toBeNull();
  });

  it("is unavailable when the request never answered", async () => {
    allFail = true;
    const { result } = renderHook(() => useMetrics("1h"), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("unavailable"));
    expect(result.current.error).toBe("Something went wrong. Try again.");
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
          .flatMap(panelsOf),
      );
    const hourly = asked("1h");
    expect(hourly.size).toBe(20);
    expect(asked("6h").size).toBe(0);

    rerender({ range: "6h" });
    await waitFor(() => expect(asked("6h")).toEqual(hourly));
  });

  it("asks once per tick, for every panel", async () => {
    const { result } = renderHook(() => useMetrics("1h"), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(panelsOf(fetchMock.mock.calls[0][0] as string)).toHaveLength(20);

    await act(() => client.refetchQueries({ queryKey: ["metrics", "1h"] }));
    expect(fetchMock).toHaveBeenCalledTimes(2);
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
