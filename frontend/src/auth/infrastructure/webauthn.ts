import { create, get, supported } from "@github/webauthn-json";

// isPasskeySupported reports whether the browser can run WebAuthn ceremonies.
export function isPasskeySupported(): boolean {
  return typeof window !== "undefined" && supported();
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
