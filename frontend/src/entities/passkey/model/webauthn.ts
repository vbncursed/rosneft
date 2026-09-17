import { create } from "@github/webauthn-json";

/**
 * Runs the browser's create() ceremony over the server's options and hands
 * back the credential as the JSON string the gateway expects. The library owns
 * the ArrayBuffer↔base64url conversion in both directions — this app writes
 * none of it, deliberately.
 */
export async function createCredential(optionsJson: string): Promise<string> {
  return JSON.stringify(await create(JSON.parse(optionsJson) as Parameters<typeof create>[0]));
}

/**
 * A dismissed system prompt, or a ceremony superseded by a newer one. Not a
 * failure the user needs told about: nothing was created and nothing was lost.
 */
export function isCancelled(err: unknown): boolean {
  return err instanceof DOMException && (err.name === "NotAllowedError" || err.name === "AbortError");
}
