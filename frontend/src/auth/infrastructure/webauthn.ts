import { create, get, supported } from "@github/webauthn-json";

// isPasskeySupported reports whether the browser can run WebAuthn ceremonies.
export function isPasskeySupported(): boolean {
  return typeof window !== "undefined" && supported();
}

// isPasskeyCancelled reports whether a ceremony ended because the user walked
// away from it rather than because anything failed.
//
// The browser raises NotAllowedError both when the prompt is dismissed and when
// it times out, with one message for both ("The operation either timed out or
// was not allowed…") — the spec keeps them indistinguishable on purpose, so a
// site cannot probe which authenticators a user holds. Neither case is worth
// reporting: the user either chose to stop or never engaged. AbortError shows
// up when a competing ceremony supersedes ours, which is equally not a failure.
export function isPasskeyCancelled(err: unknown): boolean {
  return (
    err instanceof DOMException &&
    (err.name === "NotAllowedError" || err.name === "AbortError")
  );
}

// createCredential runs the registration ceremony against the server's options
// JSON (a { publicKey: … } object from go-webauthn) and returns the attestation
// serialized as JSON for the server to verify.
export async function createCredential(optionsJson: string): Promise<string> {
  const credential = await create(JSON.parse(optionsJson));
  return JSON.stringify(credential);
}

// getAssertion runs the discoverable-login ceremony and returns the assertion
// serialized as JSON for the server to verify.
export async function getAssertion(optionsJson: string): Promise<string> {
  const assertion = await get(JSON.parse(optionsJson));
  return JSON.stringify(assertion);
}
