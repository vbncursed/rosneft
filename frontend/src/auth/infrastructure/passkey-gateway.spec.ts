// Run with: yarn test:spa  (vitest — mocks the http client the gateway drives).
import { test, beforeEach, vi } from "vitest";
import assert from "node:assert/strict";

const httpPost = vi.fn();
const httpGet = vi.fn();
const httpDelete = vi.fn();
const markAuthed = vi.fn();

vi.mock("@/shared/infrastructure/http/client", () => ({
  httpGet: (...a: unknown[]) => httpGet(...a),
  httpPost: (...a: unknown[]) => httpPost(...a),
  httpDelete: (...a: unknown[]) => httpDelete(...a),
}));
vi.mock("@/auth/infrastructure/session-marker", () => ({ markAuthed: () => markAuthed() }));

const gw = await import("./passkey-gateway");

beforeEach(() => {
  httpPost.mockReset().mockResolvedValue({ token: "session-token" });
  httpGet.mockReset().mockResolvedValue([]);
  httpDelete.mockReset().mockResolvedValue(undefined);
  markAuthed.mockReset();
});

test("loginBegin asks the gateway for the assertion options", async () => {
  httpPost.mockResolvedValue({ optionsJson: "{}", flowId: "f1" });
  const r = await gw.loginBegin();
  assert.deepEqual(httpPost.mock.calls, [["/api/auth/passkey/login/begin"]]);
  assert.equal(r.flowId, "f1");
});

test("loginFinish marks the session — the guard reads the marker, not the cookie", () => {
  // Without this the guard finds no marker and bounces the user back to /login,
  // which looks exactly like a failed passkey. The session itself is the
  // httpOnly cookie the gateway set on this same response.
  return gw.loginFinish("f1", "{assertion}").then(() => {
    assert.equal(markAuthed.mock.calls.length, 1);
  });
});

test("loginFinish posts the flow id together with the assertion", async () => {
  await gw.loginFinish("f1", "{assertion}");
  assert.deepEqual(httpPost.mock.calls[0], [
    "/api/auth/passkey/login/finish",
    { flowId: "f1", assertionJson: "{assertion}" },
  ]);
});

test("a rejected assertion marks nothing", async () => {
  httpPost.mockRejectedValue(new Error("bad assertion"));
  await assert.rejects(gw.loginFinish("f1", "{}"), /bad assertion/);
  assert.equal(markAuthed.mock.calls.length, 0);
});

test("registration is a separate flow and must not touch the session marker", async () => {
  httpPost.mockResolvedValue({ id: "c1", name: "MacBook" });
  await gw.finishRegistration("f1", "{credential}", "MacBook");
  assert.equal(markAuthed.mock.calls.length, 0, "enrolling a key must not re-issue a session");
});

test("deletePasskey sends the re-auth credential and encodes the id", async () => {
  await gw.deletePasskey("c 1", { password: "pw" });
  assert.deepEqual(httpDelete.mock.calls, [
    ["/api/auth/passkey/credentials/c%201", { password: "pw" }],
  ]);
});
