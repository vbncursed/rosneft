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

const gw = await import("./model-gateway");

const MODEL = {
  slug: "tank", title: "Tank", description: "d",
  sourceBlobHash: "src", thumbnailBlobHash: "tb",
  createdAt: "t0", updatedAt: "t1",
};
const ARTIFACT = {
  slug: "tank", lod: 0, hash: "h", contentType: "model/gltf-binary", size: 10,
  vertices: 100, faces: 50,
  bboxMin: { x: 0, y: 0, z: 0 }, bboxMax: { x: 2, y: 1, z: 2 },
  createdAt: "t0",
  artifacts: [{ lod: 0, hash: "h0", size: 10 }, { lod: 2, hash: "h2", size: 3 }],
};

beforeEach(() => {
  httpGet.mockReset().mockResolvedValue([MODEL]);
  httpPost.mockReset().mockResolvedValue({ model: MODEL, job: { id: "j1", kind: "model", slug: "tank", status: "pending" } });
  httpPatch.mockReset().mockResolvedValue(MODEL);
  httpDelete.mockReset().mockResolvedValue(undefined);
});

test("listModels maps every DTO into a domain Model", async () => {
  const out = await gw.listModels();
  assert.deepEqual(httpGet.mock.calls, [["/api/models"]]);
  assert.deepEqual(out, [MODEL]);
});

test("getModel encodes the slug into the path", async () => {
  httpGet.mockResolvedValue(MODEL);
  await gw.getModel("a b/c");
  assert.equal(httpGet.mock.calls[0][0], "/api/models/a%20b%2Fc");
});

test("createModel returns the model alongside its queued conversion job", async () => {
  const out = await gw.createModel({ title: "Tank", sourceBlobHash: "src" });
  assert.equal(httpPost.mock.calls[0][0], "/api/models");
  assert.equal(out.model.slug, "tank");
  assert.equal(out.job.status, "pending");
});

test("updateModelThumbnail PATCHes only the thumbnail hash", async () => {
  await gw.updateModelThumbnail("tank", "newhash");
  assert.deepEqual(httpPatch.mock.calls[0], ["/api/models/tank", { thumbnailBlobHash: "newhash" }]);
});

test("deleteModel hits the DELETE route", async () => {
  await gw.deleteModel("tank");
  assert.deepEqual(httpDelete.mock.calls, [["/api/models/tank"]]);
});

test("listModelArtifacts maps the artifact and its LOD chain", async () => {
  httpGet.mockResolvedValue([ARTIFACT]);
  const [a] = await gw.listModelArtifacts("tank");
  assert.equal(httpGet.mock.calls[0][0], "/api/models/tank/artifacts");
  assert.equal(a.hash, "h");
  assert.deepEqual(a.lods?.map((l) => l.lod), [0, 2]);
});

test("bbox metadata survives — the measure tool derives its unit ratio from it", async () => {
  httpGet.mockResolvedValue([ARTIFACT]);
  const [a] = await gw.listModelArtifacts("tank");
  assert.deepEqual(a.bboxMin, { x: 0, y: 0, z: 0 });
  assert.deepEqual(a.bboxMax, { x: 2, y: 1, z: 2 });
});

test("an artifact with no LOD chain leaves lods undefined rather than empty", async () => {
  httpGet.mockResolvedValue([{ ...ARTIFACT, artifacts: undefined }]);
  const [a] = await gw.listModelArtifacts("tank");
  assert.equal(a.lods, undefined);
});

test("the mapper drops DTO-only fields instead of leaking them into the domain", async () => {
  httpGet.mockResolvedValue([{ ...MODEL, internalNote: "server-only" }]);
  const [m] = await gw.listModels();
  assert.equal("internalNote" in m, false);
});

test("a model with no thumbnail keeps the field undefined", async () => {
  httpGet.mockResolvedValue([{ ...MODEL, thumbnailBlobHash: undefined }]);
  assert.equal((await gw.listModels())[0].thumbnailBlobHash, undefined);
});
