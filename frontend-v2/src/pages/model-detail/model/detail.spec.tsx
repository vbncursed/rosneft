import { describe, expect, it } from "vitest";
import { aboutRows, artifactFile, artifactRows, headerMeta, lodRange, shortHash } from "./detail";

const model = {
  slug: "valve",
  title: "Valve",
  sourceBlobHash: `9f1c${"0".repeat(56)}82ab`,
  usageCount: 2,
  createdAt: "2026-09-02T10:00:00Z",
};
const art = (lod: number, faces = 100, size = 1024) => ({
  lod,
  hash: `h${lod}`,
  size,
  faces,
  vertices: faces * 2,
  bboxMin: { x: 0, y: 0, z: 0 },
  bboxMax: { x: 1.2, y: 1.8, z: 0.9 },
});

describe("model detail facts", () => {
  it("shortens a hash to its ends", () => {
    expect(shortHash(model.sourceBlobHash)).toBe("sha256:9f1c…82ab");
  });

  it("names artifact files and ranges by lod", () => {
    expect(artifactFile("valve", 1)).toBe("valve-lod1.glb");
    expect([0, 1, 2, 3].map(lodRange)).toEqual(["full detail", "mid range", "far range", "far range"]);
  });

  it("builds the header meta from what exists", () => {
    expect(headerMeta(model, [art(0), art(1), art(2)])).toBe("valve · 3 LODs · 3 KB · created 02.09");
    expect(headerMeta({ ...model, createdAt: undefined }, [])).toBe("valve");
  });

  it("lists the about rows, with triangles and bounds only when LOD 0 exists", () => {
    const rows = aboutRows(model, [art(0, 18412)]);
    expect(rows.map((r) => r.label)).toEqual(["slug", "triangles", "bounds", "hash", "placed"]);
    expect(rows[1].value).toBe("18 412");
    expect(rows[2].value).toBe("1 / 2 / 1");
    expect(rows[4]).toEqual({ label: "placed", value: "in 2 territories", tone: "fg" });
    expect(aboutRows({ ...model, usageCount: 0 }, []).map((r) => r.label)).toEqual(["slug", "hash", "placed"]);
    expect(aboutRows({ ...model, usageCount: 0 }, []).at(-1)).toMatchObject({ value: "unused", tone: "muted" });
  });

  it("prints singular territory for a usage count of one", () => {
    expect(aboutRows({ ...model, usageCount: 1 }, []).at(-1)).toMatchObject({ value: "in 1 territory" });
  });

  it("turns artifacts into download rows sorted by lod", () => {
    const rows = artifactRows("valve", [art(2), art(0, 18412, 9.8 * 1024 * 1024)]);
    expect(rows.map((r) => r.tag)).toEqual(["LOD 0", "LOD 2"]);
    expect(rows[0]).toMatchObject({
      file: "valve-lod0.glb",
      meta: "18 412 tris · full detail",
      // formatBytes rounds MB to whole numbers (see format-bytes.spec.ts); the
      // brief's literal "9.8 MB" assumed a decimal MB formatBytes never had.
      size: "10 MB",
      href: "/api/assets/h0",
    });
  });
});
