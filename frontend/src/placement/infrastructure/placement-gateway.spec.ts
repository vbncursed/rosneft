// Run with: yarn test:spa  (vitest — mocks the http client the gateway drives).
import { test, beforeEach, vi } from "vitest";
import assert from "node:assert/strict";

const httpGet = vi.fn();
const httpPost = vi.fn();
const httpPut = vi.fn();
const httpDelete = vi.fn();

vi.mock("@/shared/infrastructure/http/client", () => ({
  httpGet: (...a: unknown[]) => httpGet(...a),
  httpPost: (...a: unknown[]) => httpPost(...a),
  httpPut: (...a: unknown[]) => httpPut(...a),
  httpDelete: (...a: unknown[]) => httpDelete(...a),
}));

const gw = await import("./placement-gateway");

const DTO = {
  id: 7, territorySlug: "north", modelSlug: "tank",
  position: { x: 1, y: 2, z: 3 },
  rotation: { x: 0, y: 1.57, z: 0 },
  scale: { x: 1, y: 1, z: 1 },
  label: "Tank A", updatedAt: "t1", visiblePanoramaIds: [4, 5],
};
const BODY = { modelSlug: "tank", label: "Tank A", position: DTO.position, rotation: DTO.rotation, scale: DTO.scale };

beforeEach(() => {
  httpGet.mockReset().mockResolvedValue([DTO]);
  httpPost.mockReset().mockResolvedValue(DTO);
  httpPut.mockReset().mockResolvedValue(DTO);
  httpDelete.mockReset().mockResolvedValue(undefined);
});

test("listPlacements maps every DTO and nests under the territory", async () => {
  const out = await gw.listPlacements("north");
  assert.deepEqual(httpGet.mock.calls, [["/api/territories/north/placements"]]);
  assert.equal(out.length, 1);
  assert.equal(out[0].id, 7);
});

test("the transform survives the mapping unchanged", async () => {
  // Position in scene units, rotation Euler XYZ in radians, per-axis scale —
  // rounding or reordering any of them silently moves the object.
  const [p] = await gw.listPlacements("north");
  assert.deepEqual(p.position, { x: 1, y: 2, z: 3 });
  assert.deepEqual(p.rotation, { x: 0, y: 1.57, z: 0 });
  assert.deepEqual(p.scale, { x: 1, y: 1, z: 1 });
});

test("optional fields get renderable defaults", async () => {
  httpGet.mockResolvedValue([{ ...DTO, label: undefined, updatedAt: undefined, visiblePanoramaIds: undefined }]);
  const [p] = await gw.listPlacements("north");
  assert.equal(p.label, "");
  assert.equal(p.updatedAt, "");
  assert.deepEqual(p.visiblePanoramaIds, []);
});

test("territory slugs are percent-encoded in every route", async () => {
  await gw.listPlacements("a b/c");
  await gw.createPlacement("a b/c", BODY);
  await gw.updatePlacement("a b/c", 7, BODY);
  await gw.deletePlacement("a b/c", 7);
  const paths = [
    httpGet.mock.calls[0][0], httpPost.mock.calls[0][0],
    httpPut.mock.calls[0][0], httpDelete.mock.calls[0][0],
  ];
  for (const p of paths) assert.ok(p.includes("a%20b%2Fc"), `${p} is not encoded`);
});

test("createPlacement POSTs the body and maps the response", async () => {
  const out = await gw.createPlacement("north", BODY);
  assert.deepEqual(httpPost.mock.calls[0], ["/api/territories/north/placements", BODY]);
  assert.equal(out.id, 7);
});

test("updatePlacement PUTs to the id-scoped route", async () => {
  await gw.updatePlacement("north", 7, BODY);
  assert.equal(httpPut.mock.calls[0][0], "/api/territories/north/placements/7");
});

test("updatePlacement returns the server's updatedAt so the form re-keys", async () => {
  httpPut.mockResolvedValue({ ...DTO, updatedAt: "t2" });
  assert.equal((await gw.updatePlacement("north", 7, BODY)).updatedAt, "t2");
});

test("setPlacementVisibility replaces the allowlist in full", async () => {
  await gw.setPlacementVisibility("north", 7, [1, 2]);
  assert.deepEqual(httpPut.mock.calls[0], [
    "/api/territories/north/placements/7/visibility",
    { panoramaIds: [1, 2] },
  ]);
});

test("an empty allowlist is sent as an empty array, not omitted", async () => {
  // Omitting it would read as \"no change\" on the server rather than \"visible
  // from no panorama\".
  await gw.setPlacementVisibility("north", 7, []);
  assert.deepEqual(httpPut.mock.calls[0][1], { panoramaIds: [] });
});

test("deletePlacement hits the id-scoped DELETE route", async () => {
  await gw.deletePlacement("north", 7);
  assert.deepEqual(httpDelete.mock.calls, [["/api/territories/north/placements/7"]]);
});
