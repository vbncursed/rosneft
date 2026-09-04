import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setCsrfToken } from "@/shared/api";
import { fetchPanel } from "./metrics-gateway";

const series = { label: "gateway", points: [{ t: 1, v: 1 }], labels: { service: "gateway" } };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn(() => Promise.resolve(json([series])));
  vi.stubGlobal("fetch", fetchMock);
  setCsrfToken("csrf");
});
afterEach(() => vi.unstubAllGlobals());

const request = (n = 0) => {
  const [url, init] = fetchMock.mock.calls[n] as [string, RequestInit | undefined];
  return { url, method: init?.method ?? "GET" };
};

describe("metrics gateway", () => {
  it("requests a panel over a range and maps the series", async () => {
    const out = await fetchPanel("red-rate", "1h");
    expect(request()).toEqual({ url: "/api/metrics/query?panel=red-rate&range=1h", method: "GET" });
    expect(out).toEqual([{ label: "gateway", points: [{ t: 1, v: 1 }], labels: { service: "gateway" } }]);
  });

  it("defaults missing labels and points", async () => {
    fetchMock.mockResolvedValueOnce(json([{ label: "gateway" }]));
    const out = await fetchPanel("services-up", "15m");
    expect(out).toEqual([{ label: "gateway", points: [], labels: {} }]);
  });

  it("reads an empty body as no series", async () => {
    fetchMock.mockResolvedValueOnce(json(null));
    await expect(fetchPanel("alerts", "24h")).resolves.toEqual([]);
  });

  it("rejects with the status and the gateway's message on failure", async () => {
    fetchMock.mockResolvedValueOnce(new Response("upstream down", { status: 502 }));
    await expect(fetchPanel("red-rate", "1h")).rejects.toMatchObject({
      status: 502,
      message: "Request failed (502)",
    });
  });
});
