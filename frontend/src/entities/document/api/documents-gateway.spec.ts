import { beforeEach, describe, expect, it, vi } from "vitest";

const http = vi.hoisted(() => ({ httpGet: vi.fn(), httpPost: vi.fn(), httpDelete: vi.fn() }));
vi.mock("@/shared/api", () => http);

const { listDocuments, createDocument, deleteDocument } = await import("./documents-gateway");

const DTO = { id: 7, territorySlug: "t", title: "Plot plan.pdf", sourceBlobHash: "h", createdAt: "2026-09-14T10:00:00Z" };

describe("documents gateway", () => {
  beforeEach(() => Object.values(http).forEach((f) => f.mockReset()));

  it("lists under the territory, mapping every row", async () => {
    http.httpGet.mockResolvedValue([DTO]);
    const out = await listDocuments("t/1");
    expect(http.httpGet).toHaveBeenCalledWith("/api/territories/t%2F1/documents");
    expect(out[0]).toEqual({ ...DTO });
  });

  it("creates with the body as given", async () => {
    http.httpPost.mockResolvedValue(DTO);
    await createDocument("t", { title: "x", sourceBlobHash: "h" });
    expect(http.httpPost).toHaveBeenCalledWith("/api/territories/t/documents", { title: "x", sourceBlobHash: "h" });
  });

  it("deletes by id", async () => {
    http.httpDelete.mockResolvedValue(undefined);
    await deleteDocument("t", 7);
    expect(http.httpDelete).toHaveBeenCalledWith("/api/territories/t/documents/7");
  });

  it("maps a missing createdAt to an empty string", async () => {
    http.httpGet.mockResolvedValue([{ ...DTO, createdAt: undefined }]);
    expect((await listDocuments("t"))[0].createdAt).toBe("");
  });
});
