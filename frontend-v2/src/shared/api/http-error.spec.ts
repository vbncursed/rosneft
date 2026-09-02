import { describe, expect, it } from "vitest";
import { HttpError } from "./http-error";

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
});
