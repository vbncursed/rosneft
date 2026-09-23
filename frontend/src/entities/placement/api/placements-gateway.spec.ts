import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setCsrfToken } from "@/shared/api";
import {
  createPlacements,
  deletePlacement,
  setPlacementsGroup,
  setPlacementsHidden,
  setPlacementVisibility,
  updatePlacement,
} from "./placements-gateway";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const DTO = {
  id: 7,
  territorySlug: "north",
  modelSlug: "tank",
  position: { x: 1, y: 2, z: 3 },
  rotation: { x: 0, y: 1.57, z: 0 },
  scale: { x: 1, y: 1, z: 1 },
  label: "Tank A",
  updatedAt: "t1",
  visiblePanoramaIds: [4, 5],
};
const BODY = { modelSlug: "tank", label: "Tank A", position: DTO.position, rotation: DTO.rotation, scale: DTO.scale };

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

describe("placements gateway", () => {
  it("POSTs the whole batch to the batch route and maps every created row", async () => {
    fetchMock.mockResolvedValueOnce(json([DTO, { ...DTO, id: 8 }]));
    await expect(createPlacements("north", [BODY, BODY], "k-1")).resolves.toMatchObject([{ id: 7 }, { id: 8 }]);
    expect(request()).toEqual({
      url: "/api/territories/north/placements/batch",
      method: "POST",
      body: { items: [BODY, BODY] },
    });
  });

  // The key is what makes a retry after a dropped answer land the batch once.
  it("sends the batch's idempotency key as the Idempotency-Key header", async () => {
    fetchMock.mockResolvedValueOnce(json([DTO]));
    await createPlacements("north", [BODY], "3f2a-9c");
    const headers = new Headers((fetchMock.mock.calls[0] as [string, RequestInit])[1].headers);
    expect(headers.get("Idempotency-Key")).toBe("3f2a-9c");
    expect(headers.get("Content-Type")).toBe("application/json");
  });

  it("PUTs to the id-scoped route and returns the server's updatedAt so the form re-keys", async () => {
    fetchMock.mockResolvedValueOnce(json({ ...DTO, updatedAt: "t2" }));
    await expect(updatePlacement("north", 7, BODY)).resolves.toMatchObject({ updatedAt: "t2" });
    expect(request()).toEqual({ url: "/api/territories/north/placements/7", method: "PUT", body: BODY });
  });

  it("DELETEs the id-scoped route and resolves on 204", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(deletePlacement("north", 7)).resolves.toBeUndefined();
    expect(request()).toMatchObject({ url: "/api/territories/north/placements/7", method: "DELETE" });
  });

  it("PUTs the panorama allowlist to the visibility route and maps the answer", async () => {
    fetchMock.mockResolvedValueOnce(json({ ...DTO, visiblePanoramaIds: [1, 2], updatedAt: "t3" }));
    await expect(setPlacementVisibility("north", 5, [1, 2])).resolves.toMatchObject({ visiblePanoramaIds: [1, 2] });
    expect(request()).toEqual({
      url: "/api/territories/north/placements/5/visibility",
      method: "PUT",
      body: { panoramaIds: [1, 2] },
    });
  });

  it("percent-encodes the territory slug in every route", async () => {
    fetchMock.mockResolvedValueOnce(json([DTO]));
    await createPlacements("a b/c", [BODY], "k");
    await updatePlacement("a b/c", 7, BODY);
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await deletePlacement("a b/c", 7);
    for (const n of [0, 1, 2]) expect(request(n).url).toContain("a%20b%2Fc");
  });

  it("PUTs a bulk hide to the hidden route and resolves to how many rows changed", async () => {
    fetchMock.mockResolvedValueOnce(json({ updated: 2 }));
    await expect(setPlacementsHidden("north", [4, 5], true)).resolves.toBe(2);
    expect(request()).toEqual({
      url: "/api/territories/north/placements/hidden",
      method: "PUT",
      body: { ids: [4, 5], hidden: true },
    });
  });

  // null is "No group" and is sent explicitly. The gateway would read a missing
  // groupId as null too and ungroup, but the contract names the key, so say it.
  it("PUTs a move to the group route, sending null for No group", async () => {
    fetchMock.mockResolvedValueOnce(json({ updated: 1 }));
    await expect(setPlacementsGroup("north", [4], null)).resolves.toBe(1);
    expect(request()).toEqual({
      url: "/api/territories/north/placements/group",
      method: "PUT",
      body: { ids: [4], groupId: null },
    });
  });
});
