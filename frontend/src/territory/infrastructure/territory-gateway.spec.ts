// Run with: yarn test:spa  (vitest — mocks the http client the gateway drives).
import { test, beforeEach, vi } from "vitest";
import assert from "node:assert/strict";

const httpGet = vi.fn();
const httpPost = vi.fn();
const httpPatch = vi.fn();
const httpDelete = vi.fn();

vi.mock("@/shared/infrastructure/http/client", () => ({
  httpGet: (...a: unknown[]) => httpGet(...a),
  httpPost: (...a: unknown[]) => httpPost(...a),
  httpPatch: (...a: unknown[]) => httpPatch(...a),
  httpDelete: (...a: unknown[]) => httpDelete(...a),
}));

const gw = await import("./territory-gateway");

const TERRITORY = {
  slug: "north", title: "North", description: "d",
  sourceBlobHash: "src", createdAt: "t0", updatedAt: "t1",
};
const JOB = { id: "j1", kind: "territory", slug: "north", status: "pending" };

beforeEach(() => {
  httpGet.mockReset();
  httpPost.mockReset();
  httpPatch.mockReset();
  httpDelete.mockReset().mockResolvedValue(undefined);
});

test("listTerritories maps every DTO into a domain Territory", async () => {
  httpGet.mockResolvedValue([TERRITORY, { ...TERRITORY, slug: "south" }]);
  const out = await gw.listTerritories();
  assert.deepEqual(httpGet.mock.calls, [["/api/territories"]]);
  assert.deepEqual(out.map((t) => t.slug), ["north", "south"]);
});

test("slugs are percent-encoded into the path", async () => {
  httpGet.mockResolvedValue(TERRITORY);
  await gw.getTerritory("a b/c");
  assert.equal(httpGet.mock.calls[0][0], "/api/territories/a%20b%2Fc");
});

test("the mapper drops DTO-only fields instead of leaking them into the domain", async () => {
  httpGet.mockResolvedValue({ ...TERRITORY, internalNote: "server-only" });
  const t = await gw.getTerritory("north");
  assert.equal("internalNote" in t, false);
});

test("createTerritory returns the territory alongside the queued job", async () => {
  httpPost.mockResolvedValue({ territory: TERRITORY, job: JOB });
  const out = await gw.createTerritory({ slug: "north", title: "North", sourceBlobHash: "src" });
  assert.equal(out.territory.slug, "north");
  assert.equal(out.job.id, "j1");
  assert.equal(httpPost.mock.calls[0][0], "/api/territories");
});

test("replaceTerritorySource posts to the source endpoint and returns the new job", async () => {
  httpPost.mockResolvedValue({ territory: TERRITORY, job: JOB });
  const out = await gw.replaceTerritorySource("north", { sourceBlobHash: "new" });
  assert.equal(httpPost.mock.calls[0][0], "/api/territories/north/source");
  assert.equal(out.job.status, "pending");
});

test("updateTerritory PATCHes and maps the response", async () => {
  httpPatch.mockResolvedValue({ ...TERRITORY, title: "Renamed" });
  assert.equal((await gw.updateTerritory("north", { title: "Renamed" })).title, "Renamed");
});

test("deleteTerritory hits the DELETE route", async () => {
  await gw.deleteTerritory("north");
  assert.deepEqual(httpDelete.mock.calls, [["/api/territories/north"]]);
});

const BUNDLE = {
  territory: TERRITORY,
  artifact: {
    slug: "north", lod: 0, hash: "h", contentType: "model/gltf-binary", size: 10,
    bboxMin: { x: 0, y: 0, z: 0 }, bboxMax: { x: 1, y: 1, z: 1 },
    artifacts: [{ lod: 0, hash: "h0", size: 10 }, { lod: 1, hash: "h1", size: 5 }],
  },
  placements: [{
    id: 1, territorySlug: "north", modelSlug: "tank",
    position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 },
  }],
  modelOptions: [{ slug: "tank", title: "Tank", artifacts: [{ lod: 0, hash: "mh", size: 3 }] }],
};

test("getSceneBundle maps the whole aggregate in one call", async () => {
  httpGet.mockResolvedValue(BUNDLE);
  const b = await gw.getSceneBundle("north");
  assert.equal(httpGet.mock.calls[0][0], "/api/territories/north/scene");
  assert.equal(b.territory.slug, "north");
  assert.equal(b.artifact?.hash, "h");
  assert.equal(b.placements.length, 1);
  assert.equal(b.modelOptions.length, 1);
});

test("a missing artifact maps to null — the route renders ConversionPending", async () => {
  httpGet.mockResolvedValue({ ...BUNDLE, artifact: null });
  assert.equal((await gw.getSceneBundle("north")).artifact, null);
});

test("absent panorama and document arrays become empty ones, never undefined", async () => {
  httpGet.mockResolvedValue(BUNDLE);
  const b = await gw.getSceneBundle("north");
  assert.deepEqual(b.panoramas, []);
  assert.deepEqual(b.documents, []);
});

test("the artifact's LOD chain is mapped through, preserving order", async () => {
  httpGet.mockResolvedValue(BUNDLE);
  const b = await gw.getSceneBundle("north");
  assert.deepEqual(b.artifact?.lods?.map((l) => l.lod), [0, 1]);
});

test("an artifact with no LOD chain leaves lods undefined rather than empty", async () => {
  const noChain = { ...BUNDLE.artifact, artifacts: undefined };
  httpGet.mockResolvedValue({ ...BUNDLE, artifact: noChain });
  assert.equal((await gw.getSceneBundle("north")).artifact?.lods, undefined);
});

test("optional placement fields get defaults the UI can render", async () => {
  httpGet.mockResolvedValue(BUNDLE);
  const [p] = (await gw.getSceneBundle("north")).placements;
  // label feeds an input, updatedAt re-keys the form, visiblePanoramaIds is
  // iterated — undefined would break all three.
  assert.equal(p.label, "");
  assert.equal(p.updatedAt, "");
  assert.deepEqual(p.visiblePanoramaIds, []);
});

test("a model option without a thumbnail hash has no thumbnail URL", async () => {
  httpGet.mockResolvedValue(BUNDLE);
  assert.equal((await gw.getSceneBundle("north")).modelOptions[0].thumbnailUrl, undefined);
});

test("a thumbnail hash becomes an absolute gateway asset URL", async () => {
  const withThumb = [{ ...BUNDLE.modelOptions[0], thumbnailBlobHash: "tb" }];
  httpGet.mockResolvedValue({ ...BUNDLE, modelOptions: withThumb });
  const [opt] = (await gw.getSceneBundle("north")).modelOptions;
  assert.equal(opt.thumbnailUrl, "http://localhost:8080/api/assets/tb");
});
