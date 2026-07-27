import { describe, it, expect, beforeEach } from "vitest";
import { getToken, setToken, clearToken } from "@/auth/infrastructure/token-store";

describe("token-store", () => {
  beforeEach(() => localStorage.clear());

  it("returns null when no token", () => {
    expect(getToken()).toBeNull();
  });

  it("round-trips a token", () => {
    setToken("abc.def");
    expect(getToken()).toBe("abc.def");
  });

  it("clears the token", () => {
    setToken("abc.def");
    clearToken();
    expect(getToken()).toBeNull();
  });
});
