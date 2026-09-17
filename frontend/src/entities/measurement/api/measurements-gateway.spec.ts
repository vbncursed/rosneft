import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setCsrfToken } from "@/shared/api";
import {
  createMeasurement,
  deleteMeasurement,
  deleteMeasurements,
  listMeasurements,
  updateMeasurement,
} from "./measurements-gateway";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const POINTS = [
  { x: 0, y: 0, z: 0 },
  { x: 1, y: 0, z: 0 },
];
const DTO = { id: 7, territorySlug: "north", points: POINTS, closed: false, createdAt: "t", updatedAt: "t" };
const BODY = { points: POINTS, closed: false };
const STORED = { serverId: 7, points: POINTS, closed: false };

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn(() => Promise.resolve(json(DTO)));
  vi.stubGlobal("fetch", fetchMock);
  setCsrfToken("csrf");
});
afterEach(() => vi.unstubAllGlobals());

const request = (n = 0) => {
  const [url, init] = fetchMock.mock.calls[n] as [string, RequestInit];
  return { url, method: init.method ?? "GET", body: init.body ? JSON.parse(init.body as string) : undefined };
};
const noContent = () => fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));

describe("measurements gateway", () => {
  it("GETs the territory's chains and maps each one", async () => {
    fetchMock.mockResolvedValueOnce(json([DTO]));
    await expect(listMeasurements("north")).resolves.toEqual([STORED]);
    expect(request()).toEqual({ url: "/api/territories/north/measurements", method: "GET", body: undefined });
  });

  it("POSTs a finished chain and answers with its server id", async () => {
    await expect(createMeasurement("north", BODY)).resolves.toEqual(STORED);
    expect(request()).toEqual({ url: "/api/territories/north/measurements", method: "POST", body: BODY });
  });

  it("PUTs the whole chain to the id-scoped route", async () => {
    await expect(updateMeasurement("north", 7, BODY)).resolves.toEqual(STORED);
    expect(request()).toEqual({ url: "/api/territories/north/measurements/7", method: "PUT", body: BODY });
  });

  it("DELETEs one chain by id", async () => {
    noContent();
    await expect(deleteMeasurement("north", 7)).resolves.toBeUndefined();
    expect(request()).toMatchObject({ url: "/api/territories/north/measurements/7", method: "DELETE" });
  });

  it("DELETEs every chain of the territory on the collection route", async () => {
    fetchMock.mockResolvedValueOnce(json({ deleted: 3 }));
    await expect(deleteMeasurements("north")).resolves.toBeUndefined();
    expect(request()).toMatchObject({ url: "/api/territories/north/measurements", method: "DELETE" });
  });

  it("percent-encodes the territory slug in every route", async () => {
    fetchMock.mockResolvedValueOnce(json([]));
    await listMeasurements("a b/c");
    await createMeasurement("a b/c", BODY);
    await updateMeasurement("a b/c", 7, BODY);
    noContent();
    await deleteMeasurement("a b/c", 7);
    noContent();
    await deleteMeasurements("a b/c");
    for (const n of [0, 1, 2, 3, 4]) expect(request(n).url).toContain("/api/territories/a%20b%2Fc/measurements");
  });
});
