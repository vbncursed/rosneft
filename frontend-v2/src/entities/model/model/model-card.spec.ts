import { describe, expect, it } from "vitest";
import type { Artifact } from "@/entities/content";
import type { TargetJob } from "@/entities/conversion";
import type { Model } from "./model";
import { toModelCard } from "./model-card";

const model = (over: Partial<Model> = {}): Model => ({
  slug: "pump-jack-unit",
  title: "Pump Jack Unit",
  sourceBlobHash: "a".repeat(64),
  usageCount: 6,
  ...over,
});

const ZERO = { x: 0, y: 0, z: 0 };
const ARTIFACTS: Artifact[] = [
  { lod: 0, size: 30 * 1024 * 1024, hash: "h0", vertices: 0, faces: 0, bboxMin: ZERO, bboxMax: ZERO },
  { lod: 1, size: 6 * 1024 * 1024, hash: "h1", vertices: 0, faces: 0, bboxMin: ZERO, bboxMax: ZERO },
  { lod: 2, size: 2 * 1024 * 1024, hash: "h2", vertices: 0, faces: 0, bboxMin: ZERO, bboxMax: ZERO },
];

const job = (over: Partial<TargetJob> = {}): TargetJob => ({
  kind: "model",
  slug: "pump-jack-unit",
  status: "running",
  progress: 0.5,
  stage: "encoding",
  errorMessage: null,
  ...over,
});

describe("toModelCard", () => {
  it("is ready with a thumbnail, a size chip and the plural in-use trailing", () => {
    expect(
      toModelCard(model({ thumbnailBlobHash: "b".repeat(64) }), ARTIFACTS),
    ).toEqual({
      slug: "pump-jack-unit",
      title: "Pump Jack Unit",
      status: "ready",
      thumbnailUrl: "/api/assets/" + "b".repeat(64),
      usageCount: 6,
      size: "38 MB",
      lods: "LOD 0-2",
      trailing: { label: "in 6 territories", tone: "accent" },
    });
  });

  it("singularises a single placement", () => {
    expect(toModelCard(model({ usageCount: 1 }), ARTIFACTS).trailing).toEqual({
      label: "in 1 territory",
      tone: "accent",
    });
  });

  it("reads zero usage as unused, muted", () => {
    expect(toModelCard(model({ usageCount: 0 }), ARTIFACTS).trailing).toEqual({
      label: "unused",
      tone: "muted",
    });
  });

  it("has no thumbnail url without a thumbnailBlobHash", () => {
    expect(toModelCard(model(), ARTIFACTS).thumbnailUrl).toBeNull();
  });

  it("does not dash the size chip when artifacts exist", () => {
    expect(toModelCard(model(), ARTIFACTS).size).toBe("38 MB");
  });

  it("dashes the size chip with nothing converted", () => {
    expect(toModelCard(model(), []).size).toBe("—");
  });

  it("is converting with a queued trailing, whatever the usage count says", () => {
    const card = toModelCard(model({ usageCount: 6 }), ARTIFACTS, job());
    expect(card.status).toBe("converting");
    expect(card.trailing).toEqual({ label: "queued", tone: "warn" });
  });

  it("is failed with an unavailable trailing, whatever the usage count says", () => {
    const card = toModelCard(
      model({ usageCount: 3 }),
      [],
      job({ status: "failed", progress: null, stage: null, errorMessage: "boom" }),
    );
    expect(card.status).toBe("failed");
    expect(card.trailing).toEqual({ label: "unavailable", tone: "bad" });
  });

  it("dashes lods with nothing converted", () => {
    expect(toModelCard(model(), []).lods).toBe("—");
  });
});
