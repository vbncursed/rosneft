import { describe, expect, it } from "vitest";
import { HttpError, messageOf } from "./http-error";

describe("HttpError", () => {
  it("carries the status and the parsed body", () => {
    const err = new HttpError(422, { code: "slug_taken", message: "slug taken" }, "slug taken");
    expect(err.status).toBe(422);
    expect(err.body).toEqual({ code: "slug_taken", message: "slug taken" });
    expect(err.message).toBe("slug taken");
  });

  it("stays an HttpError after being thrown and caught", () => {
    try {
      throw new HttpError(403, null, "You don't have permission to do this");
    } catch (err) {
      expect(err).toBeInstanceOf(HttpError);
      expect(err).toBeInstanceOf(Error);
    }
  });

  it("prefers the gateway's message and falls back for anything else", () => {
    expect(messageOf(new HttpError(422, null, "Cannot freeze the last admin."))).toBe(
      "Cannot freeze the last admin.",
    );
    expect(messageOf(new TypeError("Failed to fetch"))).toBe("Something went wrong. Try again.");
    expect(messageOf(null, "Export failed")).toBe("Export failed");
  });

  // A 5xx body names no refusal the operator can act on — the gateway answers
  // "internal error" or a fixed string of its own — so it reads as the fallback.
  it("shows the fallback for a server failure, not the server's text", () => {
    expect(messageOf(new HttpError(500, { code: "internal", message: "internal error" }, "internal error"))).toBe(
      "Something went wrong. Try again.",
    );
    expect(messageOf(new HttpError(502, null, "Bad Gateway"), "Export failed")).toBe("Export failed");
    expect(messageOf(new HttpError(499, null, "Client closed"))).toBe("Client closed");
  });
});
