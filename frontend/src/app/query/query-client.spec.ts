import { describe, expect, it } from "vitest";
import { HttpError } from "@/shared/api";
import { shouldRetry } from "./query-client";

describe("shouldRetry", () => {
  it("retries a network failure once", () => {
    expect(shouldRetry(0, new Error("network"))).toBe(true);
    expect(shouldRetry(1, new Error("network"))).toBe(false);
  });

  it("never retries a 401 — the user is already on their way to /login", () => {
    expect(shouldRetry(0, new HttpError(401, null, "unauthenticated"))).toBe(false);
  });

  it("never retries a 403 — permission will not change between attempts", () => {
    expect(shouldRetry(0, new HttpError(403, null, "forbidden"))).toBe(false);
  });

  it("does retry a 503, which may well change", () => {
    expect(shouldRetry(0, new HttpError(503, null, "unavailable"))).toBe(true);
  });
});
