import { beforeEach, describe, expect, it, vi } from "vitest";

const http = vi.hoisted(() => ({ httpGet: vi.fn(), httpPost: vi.fn(), httpPut: vi.fn(), httpDelete: vi.fn() }));
vi.mock("@/shared/api", () => http);

const { listPanoramas, createPanorama, updatePanorama, deletePanorama } = await import("./panoramas-gateway");

const DTO = { id: 7, territorySlug: "t", slug: "control-room", title: "Control room, north door", sourceBlobHash: "h", position: { x: 1, y: 2, z: 3 }, yawOffset: 0.5, defaultYaw: 1.2, updatedAt: "2026-09-14T10:00:00Z" };

describe("panoramas gateway", () => {
  beforeEach(() => Object.values(http).forEach((f) => f.mockReset()));

  it("lists under the territory, mapping every row", async () => {
    http.httpGet.mockResolvedValue([DTO]);
    const out = await listPanoramas("t/1");
    expect(http.httpGet).toHaveBeenCalledWith("/api/territories/t%2F1/panoramas");
    expect(out[0]).toEqual({ ...DTO, territorySlug: "t", thumbnailBlobHash: null });
  });

  it("creates with the body as given", async () => {
    http.httpPost.mockResolvedValue(DTO);
    await createPanorama("t", { title: "x", sourceBlobHash: "h", yawOffset: 0 });
    expect(http.httpPost).toHaveBeenCalledWith("/api/territories/t/panoramas", { title: "x", sourceBlobHash: "h", yawOffset: 0 });
  });

  it("updates with all four fields — the gateway zeroes what is absent", async () => {
    http.httpPut.mockResolvedValue(DTO);
    await updatePanorama("t", 7, { title: "x", position: { x: 0, y: 0, z: 0 }, yawOffset: 1, defaultYaw: 2 });
    expect(http.httpPut).toHaveBeenCalledWith("/api/territories/t/panoramas/7", { title: "x", position: { x: 0, y: 0, z: 0 }, yawOffset: 1, defaultYaw: 2 });
  });

  it("deletes by id", async () => {
    http.httpDelete.mockResolvedValue(undefined);
    await deletePanorama("t", 7);
    expect(http.httpDelete).toHaveBeenCalledWith("/api/territories/t/panoramas/7");
  });

  it("maps a missing updatedAt to an empty string", async () => {
    http.httpGet.mockResolvedValue([{ ...DTO, updatedAt: undefined }]);
    expect((await listPanoramas("t"))[0].updatedAt).toBe("");
  });
});
