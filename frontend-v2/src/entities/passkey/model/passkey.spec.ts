import { describe, expect, it } from "vitest";
import { passkeyMeta } from "./passkey";

const key = { id: "k1", name: "MacBook Pro", createdAt: "2026-08-12T09:20:00Z", lastUsedAt: null };

describe("passkeyMeta", () => {
  it("names the day it was added", () => {
    expect(passkeyMeta(key)).toBe("Added 12.08.2026");
  });

  it("adds the last use only when there was one", () => {
    expect(passkeyMeta({ ...key, lastUsedAt: "2026-09-07T18:02:00Z" })).toBe(
      "Added 12.08.2026 · last used 07.09.2026",
    );
  });

  it("says nothing it cannot read", () => {
    expect(passkeyMeta({ ...key, createdAt: "" })).toBe("Added —");
  });
});
