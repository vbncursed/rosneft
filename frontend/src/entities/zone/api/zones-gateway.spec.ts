import { beforeEach, describe, expect, it, vi } from "vitest";

const http = vi.hoisted(() => ({ httpPost: vi.fn(), httpPatch: vi.fn(), httpDelete: vi.fn() }));
vi.mock("@/shared/api", () => http);

const { createZone, patchZone, deleteZone } = await import("./zones-gateway");

const P = { x: 0, y: 0, z: 0 };
const DTO = {
  id: 3,
  title: "N2",
  corners: [P, P, P, P],
  tags: [],
  drawingWidthM: null,
  drawingHeightM: null,
  createdAt: "",
  updatedAt: "",
};

describe("zones gateway", () => {
  beforeEach(() => Object.values(http).forEach((f) => f.mockReset()));

  it("creates with POST under the territory and maps the answer", async () => {
    http.httpPost.mockResolvedValue(DTO);
    const body = {
      title: "N2",
      tagSlugs: ["tanks"],
      corners: DTO.corners as never,
      drawingWidthM: 7.5,
      drawingHeightM: 13,
    };
    const out = await createZone("t/1", body);
    expect(http.httpPost).toHaveBeenCalledWith("/api/territories/t%2F1/zones", body);
    expect(out.id).toBe(3);
  });

  it("leaves the drawing size out of the body when it is unknown", async () => {
    http.httpPost.mockResolvedValue(DTO);
    await createZone("t", {
      title: "N2",
      tagSlugs: [],
      corners: DTO.corners as never,
      drawingWidthM: null,
      drawingHeightM: null,
    });
    const sent = http.httpPost.mock.calls[0][1];
    expect("drawingWidthM" in sent).toBe(false);
    expect("drawingHeightM" in sent).toBe(false);
  });

  it("patches by id with only the given fields", async () => {
    http.httpPatch.mockResolvedValue(DTO);
    await patchZone("t", 3, { tagSlugs: ["cranes"] });
    expect(http.httpPatch).toHaveBeenCalledWith("/api/territories/t/zones/3", { tagSlugs: ["cranes"] });
  });

  it("deletes by id", async () => {
    http.httpDelete.mockResolvedValue(undefined);
    await deleteZone("t", 3);
    expect(http.httpDelete).toHaveBeenCalledWith("/api/territories/t/zones/3");
  });
});
