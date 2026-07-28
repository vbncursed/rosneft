// Run with: yarn test:spa  (vitest — resolves the `@/` alias).
import { test } from "vitest";
import assert from "node:assert/strict";

import { formatError } from "./format-error";
import { HttpError } from "./http-error";
import { notFoundOnHttp404 } from "./not-found-on-404";

test("prefers the gateway's structured message", () => {
  assert.equal(formatError(new HttpError(409, { code: "conflict", message: "slug taken" }, "conflict")), "slug taken");
});

test("falls back to the status line when the body carries no message", () => {
  assert.equal(formatError(new HttpError(502, null, "bad gateway")), "HTTP 502");
  assert.equal(formatError(new HttpError(500, { code: "internal" } as unknown as { code: string; message: string }, "boom")), "HTTP 500");
});

test("renders a plain Error by its message", () => {
  assert.equal(formatError(new Error("network down")), "network down");
});

test("renders a non-Error throw without leaking [object Object] into the UI", () => {
  assert.equal(formatError("just a string"), "unknown error");
  assert.equal(formatError({ message: "not an Error" }), "unknown error");
  assert.equal(formatError(undefined), "unknown error");
});

test("HttpError keeps its status and body for callers that branch on them", () => {
  const err = new HttpError(404, { code: "not_found", message: "gone" }, "not found");
  assert.equal(err.status, 404);
  assert.equal(err.body?.message, "gone");
  assert.equal(err.name, "HttpError");
  assert.ok(err instanceof Error, "must survive an instanceof Error check");
});

test("notFoundOnHttp404 swallows a 404 into the fallback", () => {
  assert.deepEqual(notFoundOnHttp404([])(new HttpError(404, null, "nope")), []);
  assert.equal(notFoundOnHttp404(null)(new HttpError(404, null, "nope")), null);
});

test("notFoundOnHttp404 rethrows every other status", () => {
  assert.throws(() => notFoundOnHttp404([])(new HttpError(500, null, "boom")), /boom/);
  assert.throws(() => notFoundOnHttp404([])(new HttpError(403, null, "denied")), /denied/);
});

test("notFoundOnHttp404 rethrows non-HTTP failures untouched", () => {
  const err = new Error("offline");
  assert.throws(() => notFoundOnHttp404([])(err), (thrown) => thrown === err);
});
