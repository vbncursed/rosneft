// Run with: yarn test:spa  (vitest + jsdom — DOMException is a browser type).
import { afterEach, describe, expect, it, test } from "vitest";
import assert from "node:assert/strict";

import { isPasskeyCancelled, isPasskeySupported } from "./webauthn";

// The exact error a browser raises when the prompt is dismissed. The spec keeps
// cancellation and timeout indistinguishable, so this one message covers both.
const dismissed = () =>
  new DOMException(
    "The operation either timed out or was not allowed. See: https://www.w3.org/TR/webauthn-2/#sctn-privacy-considerations-client.",
    "NotAllowedError",
  );

test("a dismissed prompt counts as cancelled, not as a failure", () => {
  assert.equal(isPasskeyCancelled(dismissed()), true);
});

test("a superseded ceremony counts as cancelled too", () => {
  assert.equal(isPasskeyCancelled(new DOMException("aborted", "AbortError")), true);
});

test("a real WebAuthn failure is still reported", () => {
  // e.g. the authenticator already holds a credential for this account.
  assert.equal(isPasskeyCancelled(new DOMException("already registered", "InvalidStateError")), false);
  assert.equal(isPasskeyCancelled(new DOMException("bad rp id", "SecurityError")), false);
});

test("a gateway or network error is still reported", () => {
  assert.equal(isPasskeyCancelled(new Error("HTTP 500")), false);
  assert.equal(isPasskeyCancelled("just a string"), false);
  assert.equal(isPasskeyCancelled(null), false);
  assert.equal(isPasskeyCancelled(undefined), false);
});

test("matching is by name, not by message text", () => {
  // The wording is browser-specific and localised; keying on it would break on
  // Safari or in another locale.
  assert.equal(isPasskeyCancelled(new DOMException("wholly different wording", "NotAllowedError")), true);
  assert.equal(
    isPasskeyCancelled(new Error("The operation either timed out or was not allowed.")),
    false,
  );
});

describe("isPasskeySupported in the desktop shell", () => {
  afterEach(() => {
    delete (window as { __DESKTOP__?: boolean }).__DESKTOP__;
    // @ts-expect-error -- test-only stub, restoring jsdom's absence of the API.
    delete navigator.credentials;
  });

  // The RP origin inside the shell is a loopback port, which
  // PASSKEY_RP_ORIGINS will never list. A ceremony started here fails with an
  // opaque client-side error and no server log, so the UI must not offer one.
  it("reports unsupported when running inside the desktop shell", () => {
    (window as { PublicKeyCredential?: unknown }).PublicKeyCredential = function () {};
    // jsdom has no navigator.credentials by default; stub it so this test
    // actually exercises the __DESKTOP__ gate rather than passing vacuously.
    Object.defineProperty(navigator, "credentials", {
      value: { create: () => {}, get: () => {} },
      configurable: true,
    });
    (window as { __DESKTOP__?: boolean }).__DESKTOP__ = true;
    expect(isPasskeySupported()).toBe(false);
  });
});
