import { afterEach, describe, expect, it, vi } from "vitest";
import { clearCsrfToken, ensureCsrfToken, getCsrfToken, setCsrfToken } from "./csrf";
import { clearAuthed, markAuthed } from "@/shared/session";

afterEach(() => {
  clearCsrfToken();
  clearAuthed();
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("ensureCsrfToken", () => {
  it("returns a stored token without fetching", async () => {
    markAuthed();
    setCsrfToken("stored-token");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(ensureCsrfToken()).resolves.toBe("stored-token");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns null and fetches nothing when there is no session", async () => {
    clearAuthed();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(ensureCsrfToken()).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(getCsrfToken()).toBeNull();
  });

  it("dedupes two concurrent calls into a single request", async () => {
    markAuthed();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ csrfToken: "fresh-token" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const [a, b] = await Promise.all([ensureCsrfToken(), ensureCsrfToken()]);

    expect(a).toBe("fresh-token");
    expect(b).toBe("fresh-token");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
