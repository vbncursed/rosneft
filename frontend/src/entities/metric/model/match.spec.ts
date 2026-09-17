import { describe, expect, it } from "vitest";
import { matchesService } from "./match";

describe("matchesService", () => {
  it("matches a gRPC service name against the scrape name it contains, either way round", () => {
    expect(matchesService("rosneft.catalog.v1.CatalogService", "catalog")).toBe(true);
    expect(matchesService("mesh", "rosneft.mesh.v1.MeshService")).toBe(true);
    expect(matchesService("Gateway", "gateway")).toBe(true);
    expect(matchesService("audit", "catalog")).toBe(false);
  });
});
