import { describe, it, expect } from "vitest";
import { assetUrl } from "@/shared/infrastructure/asset-url";

describe("assetUrl", () => {
  it("builds an absolute gateway URL", () => {
    expect(assetUrl("abc123")).toBe("http://localhost:8080/api/assets/abc123");
  });
  it("encodes the hash", () => {
    expect(assetUrl("a/b")).toBe("http://localhost:8080/api/assets/a%2Fb");
  });
});
