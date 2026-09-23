import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchPanels } from "./metrics-gateway";

const series = { label: "gateway", points: [{ t: 1, v: 1 }], labels: { service: "gateway" } };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn(() => Promise.resolve(json([series])));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const request = (n = 0) => {
  const [url, init] = fetchMock.mock.calls[n] as [string, RequestInit | undefined];
  return { url, method: init?.method ?? "GET" };
};

describe("metrics gateway", () => {
  it("asks for every panel in one request and maps each one's series", async () => {
    fetchMock.mockResolvedValueOnce(json({ "red-rate": [series], alerts: [] }));
    const out = await fetchPanels(["red-rate", "alerts"], "1h");
    expect(request()).toEqual({
      url: "/api/metrics/query?panel=red-rate&panel=alerts&range=1h",
      method: "GET",
    });
    expect(out).toEqual({
      "red-rate": [{ label: "gateway", points: [{ t: 1, v: 1 }], labels: { service: "gateway" } }],
      alerts: [],
    });
  });

  it("defaults missing labels and points, and reads a null panel as no series", async () => {
    fetchMock.mockResolvedValueOnce(json({ "services-up": [{ label: "gateway" }], alerts: null }));
    await expect(fetchPanels(["services-up", "alerts"], "15m")).resolves.toEqual({
      "services-up": [{ label: "gateway", points: [], labels: {} }],
      alerts: [],
    });
  });

  it("reads a null body as no panel answered rather than throwing", async () => {
    fetchMock.mockResolvedValueOnce(json(null));
    await expect(fetchPanels(["red-rate"], "1h")).resolves.toEqual({});
  });

  it("leaves a panel the gateway could not answer out of the map", async () => {
    fetchMock.mockResolvedValueOnce(json({ "red-rate": [series] }));
    expect(await fetchPanels(["red-rate", "alerts"], "1h")).not.toHaveProperty("alerts");
  });

  it("rejects with the status and the gateway's message on failure", async () => {
    fetchMock.mockResolvedValueOnce(json({ code: "unavailable", message: "Prometheus unreachable" }, 502));
    await expect(fetchPanels(["red-rate"], "1h")).rejects.toMatchObject({
      status: 502,
      message: "Prometheus unreachable",
    });
  });
});
