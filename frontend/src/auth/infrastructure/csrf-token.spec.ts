import { describe, it, expect, beforeEach } from "vitest";
import { setCsrfToken, getCsrfToken, clearCsrfToken } from "@/auth/infrastructure/csrf-token";

beforeEach(() => {
  clearCsrfToken();
  localStorage.clear();
});

describe("csrf token", () => {
  it("has no token before anyone logs in", () => {
    expect(getCsrfToken()).toBeNull();
  });

  it("remembers the token handed out at login", () => {
    setCsrfToken("tok-1");
    expect(getCsrfToken()).toBe("tok-1");
  });

  it("forgets on logout", () => {
    setCsrfToken("tok-1");
    clearCsrfToken();
    expect(getCsrfToken()).toBeNull();
  });

  // Memory only, deliberately: a token in storage outlives the tab and is one
  // more secret at rest. It is re-read from /api/auth/me on every page load.
  it("never touches persistent storage", () => {
    setCsrfToken("tok-1");
    expect(JSON.stringify(localStorage)).not.toContain("tok-1");
    expect(document.cookie).not.toContain("tok-1");
  });
});
