import { describe, expect, it } from "vitest";
import { toDocument } from "./to-document";

const DTO = {
  id: 7,
  territorySlug: "t",
  title: "Plot plan.pdf",
  sourceBlobHash: "h",
  createdAt: "2026-09-14T10:00:00Z",
  calibration: null,
};

describe("toDocument", () => {
  it("carries every field through untouched", () => {
    expect(toDocument(DTO)).toEqual({
      id: 7,
      territorySlug: "t",
      title: "Plot plan.pdf",
      sourceBlobHash: "h",
      createdAt: "2026-09-14T10:00:00Z",
      calibration: null,
    });
  });

  it("maps a calibration, a null utm included", () => {
    const calibration = {
      page: 2,
      points: [
        { pdf: { x: 1, y: 2 }, scene: { x: 3, y: 4, z: 5 }, utm: { e: 10, n: 20 } },
        { pdf: { x: 6, y: 7 }, scene: { x: 8, y: 9, z: 0 }, utm: null },
      ],
    };
    expect(toDocument({ ...DTO, calibration }).calibration).toEqual(calibration);
  });

  it("maps a missing createdAt to an empty string", () => {
    expect(toDocument({ ...DTO, createdAt: undefined }).createdAt).toBe("");
  });
});
